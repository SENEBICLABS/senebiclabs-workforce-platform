import "server-only";
import { createHash, randomBytes } from "crypto";
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

/** What one inviter may send in a rolling day. */
export const INVITE_DAILY_CAP = 20;
export const INVITE_CAP_WINDOW_SECONDS = 86_400;

/**
 * How many invitations an inviter has created inside the window.
 *
 * The daily cap counts rows rather than trusting the in-memory limiter,
 * because the two limits want different properties. The burst limit only has
 * to make a script conspicuous, so a per-instance approximation is fine and
 * free. This one is the number that bounds how much branded mail a compromised
 * account can put into the world, and a limiter whose effective cap is the
 * limit times however many serverless instances happen to be warm does not
 * bound anything. It has to be true, so it comes from the data.
 *
 * EVERY status counts, including revoked.
 *
 * A revoked row is either a send we failed or an invitation an operator
 * withdrew, and nothing in the schema distinguishes them — createAndSendInvite
 * and the ops revoke endpoint write the same value. So any status-based rule
 * would be guessing at which happened.
 *
 * Counting all of them is the right side to err on. What damages sending
 * reputation is attempts, not deliveries: a hard bounce costs more than a
 * successful send, and a failed send has already been attempted by the time
 * the row is revoked. Excluding revoked rows would let someone mint cap-free
 * invitations by inducing failures, which is precisely the abuse the cap
 * exists for. The cost of the other error is bounded and loud: if our sending
 * is broken, a member hits a cap they did not earn, which is a visible symptom
 * of an outage an operator can see and raise. Under-counting is a quiet hole;
 * over-counting is a noisy inconvenience.
 *
 * If that fairness ever bites, the fix is to make the distinction reachable —
 * a revoked_reason, or a separate status for a failed send — not to guess it
 * from 'revoked'.
 *
 * Returns null if the count could not be taken. The caller lets the invite
 * through in that case: the insert needs the same database a moment later, so
 * refusing here buys nothing the insert will not do for itself.
 */
export async function countInvitesCreatedBy(
  inviterId: string | null,
  windowSeconds = INVITE_CAP_WINDOW_SECONDS
): Promise<number | null> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  let q = supabaseAdmin
    .from("invites")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  // Operator-console invitations carry no inviter, so they are capped as one
  // group rather than being exempt.
  q = inviterId ? q.eq("invited_by", inviterId) : q.is("invited_by", null);

  const { count, error } = await q;
  if (error) {
    console.error("[invites] could not count for the cap", error);
    return null;
  }
  return count ?? 0;
}

/**
 * Invitations created per inviter in the window, busiest first.
 *
 * The operator view of the same fact the cap enforces. Built on the same rows
 * so the two cannot disagree: what an operator sees is what the cap counted.
 */
export async function invitesCreatedPerInviter(
  windowSeconds = INVITE_CAP_WINDOW_SECONDS
): Promise<{ inviterId: string | null; count: number }[]> {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("invites")
    .select("invited_by")
    .gte("created_at", since);

  if (error) {
    console.error("[invites] could not summarise senders", error);
    return [];
  }

  const tally = new Map<string | null, number>();
  for (const row of data ?? []) {
    const key = (row.invited_by as string | null) ?? null;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([inviterId, count]) => ({ inviterId, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Invite tokens rest as a hash, never verbatim.
 *
 * The token is a bearer credential, not a hint: POSTing one to
 * /api/invites/accept creates the account and returns a session, with nothing
 * else required. The check in auth-gate that looks like it prevents that
 * compares the invite row's address to itself on this path, so possession of
 * the token is the whole proof. A row therefore has to be a record of an
 * invitation issued rather than a working key, which is the same reasoning
 * migration 008 applied to sign-in tokens — and those are single-use and
 * fifteen minutes long, and were hashed anyway.
 */
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export interface Invite {
  id: string;
  /** SHA-256 of the token. The token itself exists only in the email. */
  token_hash: string;
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
    .eq("token_hash", hashToken(token))
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
  | { ok: true; invite: { id: string; invited_email: string; expires_at: string | null } }
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
      token_hash: hashToken(token),
      invited_email: address,
      invited_by: inviterId,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, invited_email, expires_at")
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
    // From the local variable, never read back off the row: the row holds only
    // a hash now, and this is the last point at which the token exists outside
    // the recipient's mailbox.
    await sendInviteEmail(address, token, inviterName);
  } catch (err) {
    console.error("[invites] send failed", err);
    await supabaseAdmin.from("invites").update({ status: "revoked" }).eq("id", invite.id);
    return { ok: false, status: 502, error: "We could not send that invite. Try again in a moment." };
  }

  return { ok: true, invite };
}
