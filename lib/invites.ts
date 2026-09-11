import "server-only";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "./supabase";
import { sendInviteEmail } from "./send-invite";
import { findClinicianByEmail } from "./clinicians";

/**
 * Invites.
 *
 * An invite names one address, is spent once, and expires. It is also the
 * record of who vouched for whom — `invited_by` survives on the clinician row
 * after the invite is consumed.
 */

export const INVITE_TTL_DAYS = 7;

export interface Invite {
  id: string;
  token: string;
  invited_email: string;
  invited_by: string | null;
  status: "pending" | "accepted" | "expired" | "revoked";
  created_at: string;
  expires_at: string | null;
  accepted_by: string | null;
}

/** Addresses are compared case-insensitively everywhere. */
export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function newInviteToken(): string {
  // 32 bytes of urlsafe randomness — not guessable, and short enough for a link.
  return randomBytes(32).toString("base64url");
}

export type InviteProblem = "not_found" | "used" | "expired" | "revoked";

/**
 * Looks an invite up by token and says whether it may still be spent.
 *
 * Expiry is evaluated here rather than trusted from `status`, so an invite that
 * has simply aged out is treated as expired without needing a sweeper job.
 */
export async function loadInvite(
  token: string
): Promise<{ invite: Invite; problem: null } | { invite: Invite | null; problem: InviteProblem }> {
  if (!token) return { invite: null, problem: "not_found" };

  const { data } = await supabaseAdmin
    .from("invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  const invite = data as Invite | null;
  if (!invite) return { invite: null, problem: "not_found" };

  if (invite.status === "accepted") return { invite, problem: "used" };
  if (invite.status === "revoked") return { invite, problem: "revoked" };
  if (invite.status === "expired") return { invite, problem: "expired" };

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { invite, problem: "expired" };
  }

  return { invite, problem: null };
}

/** A live invite for this address, whatever token it was issued under. */
export async function findPendingInviteForEmail(
  email: string
): Promise<Invite | null> {
  const { data } = await supabaseAdmin
    .from("invites")
    .select("*")
    .eq("invited_email", normalizeEmail(email))
    .eq("status", "pending")
    .maybeSingle();

  const invite = data as Invite | null;
  if (!invite) return null;

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return null;
  }
  return invite;
}

/**
 * Marks an invite spent.
 *
 * Conditional on the row still being pending, so two sign-ins racing the same
 * invite cannot both consume it — the loser gets false and is refused.
 */
export async function consumeInvite(
  inviteId: string,
  clinicianId: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("invites")
    .update({ status: "accepted", accepted_by: clinicianId })
    .eq("id", inviteId)
    .eq("status", "pending")
    .select("id");

  return (data?.length ?? 0) > 0;
}

/** The inviter's display name, for the join page. Never their email. */
export async function inviterName(invitedBy: string | null): Promise<string | null> {
  if (!invitedBy) return null;
  const { data } = await supabaseAdmin
    .from("clinicians")
    .select("name")
    .eq("id", invitedBy)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export type InviteFailure =
  | { ok: false; status: number; error: string };

/**
 * Expires invites for one address that have aged out.
 *
 * The partial unique index idx_invites_one_pending covers every row where
 * status = 'pending', whatever expires_at says, because an index predicate
 * must be IMMUTABLE and now() is not. So a lapsed invite goes on occupying the
 * single pending slot that address gets, and the next invite to it collides
 * with a row that loadInvite and findPendingInviteForEmail both already treat
 * as dead. Nothing else sweeps it, so the address becomes permanently
 * un-invitable. Expiry has to be written down for the index to agree with what
 * the rest of the code believes.
 *
 * Adding `and expires_at > now()` to the index predicate is not an option, and
 * declaring an IMMUTABLE wrapper around now() to get past the error is worse
 * than the bug: an index records what was true at write time and would never
 * revisit rows as the clock moved, so its contents would silently disagree
 * with its own predicate.
 *
 * Returns false if the update itself failed, so the caller can tell "the slot
 * is genuinely taken" from "we could not clear it".
 */
async function expireLapsedInvites(address: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("invites")
    .update({ status: "expired" })
    // Confined to the one non-terminal state. An accepted invite from three
    // weeks ago also has expires_at in the past; flipping it to 'expired' would
    // destroy the record of who accepted and when, and leave accepted_by
    // pointing at a real clinician on a row labelled expired. Never rewrite a
    // terminal state, whatever the other columns say. consumeInvite carries the
    // same predicate for the same reason.
    .eq("status", "pending")
    .eq("invited_email", address)
    .lt("expires_at", new Date().toISOString());

  if (error) {
    console.error("[invites] could not expire lapsed rows", error);
    return false;
  }
  return true;
}

/**
 * Creates a single-use invite and emails the link.
 *
 * The one implementation behind both the clinician-facing endpoint and /ops, so
 * an invite issued by an operator is the same object, with the same expiry and
 * the same email, as one issued by a colleague.
 *
 * A send failure withdraws the invite: an invite whose link never arrived is
 * worse than none, because the partial unique index would block a retry to the
 * same address.
 */
export async function createAndSendInvite(
  email: string,
  inviterId: string | null,
  inviterName: string
): Promise<
  | { ok: true; invite: { id: string; invited_email: string; expires_at: string | null; token: string } }
  | InviteFailure
> {
  const address = normalizeEmail(email);

  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(address)) {
    return { ok: false, status: 400, error: "That does not look like an email address." };
  }

  // Through the shared lookup. Under the .ilike this used to use, a wildcard
  // could report "already has an account" about a DIFFERENT address and block a
  // legitimate invite — not a security hole like the two auth lookups were, but
  // the same shape as the bug below: a truthful-sounding refusal telling the
  // inviter to stop when they should carry on.
  const existing = await findClinicianByEmail(address);

  if (existing) {
    return { ok: false, status: 409, error: "That address already has an account." };
  }

  // Clear any lapsed invite for this address first, or its row is still
  // holding the single pending slot the unique index allows.
  const expiryRan = await expireLapsedInvites(address);

  const token = newInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: invite, error } = await supabaseAdmin
    .from("invites")
    .insert({
      token,
      invited_email: address,
      invited_by: inviterId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, token, invited_email, expires_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Stale rows were expired above, so a collision should mean a genuinely
      // live invitation. Confirm it rather than assert it.
      const live = await findPendingInviteForEmail(address);

      if (live) {
        const when = live.expires_at
          ? new Date(live.expires_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })
          : null;
        return {
          ok: false,
          status: 409,
          error: when
            ? `That address already has an invitation open until ${when}. Revoke it if you want to send a new one.`
            : "That address already has an invitation open.",
        };
      }

      // A collision with nothing live behind it: either the expiry update
      // failed, or a lapsed row is still holding the slot. Saying "an
      // invitation is waiting" would be the original bug again, telling the
      // inviter to stop when retrying is the correct action. 503 says retry,
      // 409 says do not.
      console.error(
        `[invites] collision with no live invite for ${address}; ` +
          `expiry step ${expiryRan ? "ran" : "FAILED"}`
      );
      return {
        ok: false,
        status: 503,
        error: "We could not send that invitation just now. Please try again in a moment.",
      };
    }
    console.error("[invites] insert failed", error);
    return { ok: false, status: 500, error: "We could not create that invite." };
  }

  try {
    await sendInviteEmail(address, invite.token, inviterName);
  } catch (err) {
    console.error("[invites] send failed", err);
    await supabaseAdmin.from("invites").update({ status: "revoked" }).eq("id", invite.id);
    return { ok: false, status: 502, error: "We could not send that invite. Try again in a moment." };
  }

  return { ok: true, invite };
}
