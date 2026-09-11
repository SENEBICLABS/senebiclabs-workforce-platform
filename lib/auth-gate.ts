import "server-only";
import { createHash } from "crypto";
import { SignJWT } from "jose";
import { supabaseAdmin } from "./supabase";
import { grantDirectAccess } from "./access";
import { findClinicianByEmail, type Clinician } from "./clinicians";
import {
  consumeInvite,
  findPendingInviteForEmail,
  loadInvite,
  normalizeEmail,
} from "./invites";

/**
 * The one gate.
 *
 * Every sign-in — sign-in link or Google — ends here, and this is the only place
 * a clinician row is created. Access is invite-only: an authenticated email
 * that is neither an existing member nor the subject of a live invite is
 * refused, and no account is left behind.
 */

import { jwtSecret } from "./secrets";

export type GateFailure =
  | "no_invite"
  /** Signed in as someone other than the person invited. */
  | "email_mismatch"
  | "invite_used"
  | "invite_expired"
  | "inactive"
  /** We could not complete the sign-in. Their fault in no way; retryable. */
  | "unavailable"
  /**
   * The row we matched is not the address that authenticated.
   *
   * Unreachable while the lookup is exact, which is the point: it exists to
   * catch a future lookup that is not.
   */
  | "lookup_mismatch";

export type GateResult =
  | {
      ok: true;
      clinicianId: string;
      email: string;
      sessionToken: string;
      /** True when this sign-in created the account. */
      created: boolean;
    }
  | { ok: false; reason: GateFailure };

/**
 * Mints a session for a clinician, having first proved the row is the address
 * that authenticated.
 *
 * The invariant lives here rather than at the lookup because this is where the
 * consequence is. An exact lookup already guarantees it, so the check is a
 * tripwire: if anyone later reintroduces a fuzzy match, or adds a caller that
 * resolves a clinician some other way, they are caught before a session is
 * minted rather than after. That is not hypothetical — every clinician lookup
 * in this codebase had drifted to .ilike, which returned a DIFFERENT member's
 * row for an address containing "_" or "%", and this function then signed a
 * token for it.
 *
 * It takes the row rather than an id and an email so the two cannot be
 * mismatched by a caller, and the authenticated address is a separate argument
 * of the same type only in the sense that it is a string — the parameters are
 * ordered so a transposition changes meaning rather than silently comparing a
 * value to itself.
 *
 * There is deliberately no unguarded variant. Anything that needs a session
 * comes through here.
 *
 * Reports which of its two failures happened rather than returning a bare
 * null, because they mean opposite things to the person signing in. A signing
 * fault is ours and retryable; a mismatch is not, and telling someone to try
 * again would be wrong in both directions.
 *
 * Deliberately does not throw. Signing needs JWT_SECRET, and a missing or
 * too-short one is a configuration fault that used to surface as a 500 from
 * deep inside account creation, after the account had been made and the invite
 * already spent. Returning a result lets the caller unwind properly.
 */
type Issued =
  | { ok: true; token: string }
  | { ok: false; reason: Extract<GateFailure, "unavailable" | "lookup_mismatch"> };

async function issueSessionFor(
  authenticatedEmail: string,
  row: Pick<Clinician, "id" | "email">
): Promise<Issued> {
  if (normalizeEmail(row.email) !== normalizeEmail(authenticatedEmail)) {
    console.error(
      `[gate] REFUSED to issue a session. Authenticated as ${authenticatedEmail} ` +
        `but the clinician row is ${row.email}. These must be identical; a ` +
        "mismatch means a non-exact lookup or an attack."
    );
    return { ok: false, reason: "lookup_mismatch" };
  }

  const clinicianId = row.id;
  const email = row.email;

  let sessionToken: string;
  try {
    sessionToken = await new SignJWT({ clinicianId, email })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(jwtSecret());
  } catch (err) {
    console.error("[gate] could not sign a session token", err);
    return { ok: false, reason: "unavailable" };
  }

  // The token is recorded as a SHA-256 hash rather than verbatim. This table
  // is never read back for authentication, so the plaintext bought nothing,
  // and storing it meant a database leak handed over every live session as a
  // ready-to-use cookie value.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin.from("sessions").insert({
    clinician_id: clinicianId,
    token: createHash("sha256").update(sessionToken).digest("hex"),
    expires_at: expiresAt,
  });

  // 23505 means this exact token is already recorded — harmless.
  if (error && error.code !== "23505") {
    console.error("[gate] session insert failed", error);
  }

  return { ok: true, token: sessionToken };
}

/**
 * Resolves an authenticated email into a session, or refuses.
 *
 * `inviteToken` is supplied when the person arrived through a /join link. It
 * tightens the check rather than replacing it: the authenticated address must
 * be the one that was invited, so forwarding an invite does not hand over
 * access.
 */
export async function signInOrReject(
  rawEmail: string,
  inviteToken?: string | null
): Promise<GateResult> {
  const email = normalizeEmail(rawEmail);

  // 1. Already a member.
  //
  // Deliberately not maybeSingle: duplicate rows for one address used to make
  // that error, which read as "no such member" and refused a real clinician for
  // want of an invite. The oldest row wins, so a member keeps the account their
  // history hangs off. Migration 005 stops duplicates arising.
  const existing = await findClinicianByEmail(email);

  if (existing) {
    if (existing.active === false) return { ok: false, reason: "inactive" };

    // Issued before anything is granted. issueSessionFor is what proves this
    // row is the address that authenticated, and grantDirectAccess writes, so
    // running it first would mean writing pool access for the wrong clinician
    // in exactly the case the proof exists to catch.
    const issued = await issueSessionFor(email, existing);
    if (!issued.ok) return { ok: false, reason: issued.reason };

    // Top up anyone who predates direct access, so no one is stranded on an
    // empty dashboard waiting for a calibration that is switched off.
    await grantDirectAccess(existing.id);
    return {
      ok: true,
      clinicianId: existing.id,
      email: existing.email,
      sessionToken: issued.token,
      created: false,
    };
  }

  // 2. Not a member — an invite is the only way in.
  let invite = null;

  if (inviteToken) {
    const found = await loadInvite(inviteToken);
    if (found.problem === "used") return { ok: false, reason: "invite_used" };
    if (found.problem === "expired") return { ok: false, reason: "invite_expired" };
    if (found.problem || !found.invite) return { ok: false, reason: "no_invite" };

    // The link is not a bearer token for whoever opens it.
    if (normalizeEmail(found.invite.invited_email) !== email) {
      return { ok: false, reason: "email_mismatch" };
    }
    invite = found.invite;
  } else {
    invite = await findPendingInviteForEmail(email);
  }

  if (!invite) return { ok: false, reason: "no_invite" };

  // Create the account the invite vouches for.
  const { data: created, error } = await supabaseAdmin
    .from("clinicians")
    .insert({
      email,
      name: email.split("@")[0],
      access_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
      active: true,
      can_invite: false,
      invited_by: invite.invited_by,
    })
    .select("id, email")
    .single();

  if (error || !created) {
    console.error("[gate] clinician insert failed", error);
    return { ok: false, reason: "no_invite" };
  }

  // Mint the session before spending the invite.
  //
  // This ordering matters more than it looks. When signing came after, a
  // failure here left the account created and the invitation consumed, so the
  // clinician could neither get in nor try again: their link reported "already
  // used" for ever. Now nothing is spent until everything that can fail has
  // succeeded, and a retry works.
  const issued = await issueSessionFor(email, created);
  if (!issued.ok) {
    await supabaseAdmin.from("clinicians").delete().eq("id", created.id);
    return { ok: false, reason: issued.reason };
  }

  // Spend the invite. If someone else just spent it, undo the account so an
  // invite can never yield two members.
  const consumed = await consumeInvite(invite.id, created.id);
  if (!consumed) {
    await supabaseAdmin.from("clinicians").delete().eq("id", created.id);
    return { ok: false, reason: "invite_used" };
  }

  // The invitation is the qualification while calibration is off.
  const granted = await grantDirectAccess(created.id);
  console.log(
    `[gate] created ${created.email} from invite ${invite.id}; pools granted: ${granted}`
  );

  return {
    ok: true,
    clinicianId: created.id,
    email: created.email,
    sessionToken: issued.token,
    created: true,
  };
}

/** Copy shown to someone the gate turned away. */
export const GATE_MESSAGE: Record<GateFailure, string> = {
  no_invite:
    "Senebiclabs is invite-only. Ask the colleague who told you about us to send an invite to this address.",
  email_mismatch:
    "This invite was sent to a different address. Sign in with the address the invite was sent to.",
  invite_used: "This invite has already been used.",
  invite_expired: "This invite has expired. Ask for a new one.",
  inactive: "This account is not active. Contact support if you think that is wrong.",
  unavailable:
    "We could not complete your sign-in just now. Please try again in a moment.",
  // Deliberately says nothing about why. A mismatch is a bug or an attack, and
  // neither wants a description of the mechanism.
  lookup_mismatch:
    "We could not verify this account. Please contact support.",
};
