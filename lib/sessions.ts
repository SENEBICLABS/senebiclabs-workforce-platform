import "server-only";
import { createHash } from "crypto";
import { supabaseAdmin } from "./supabase";

/**
 * Sessions as rows that can be ended.
 *
 * A session token is a signed JWT, and the signature says we issued it. It does
 * not say the session is still wanted. That is what the sessions row is for: it
 * is written when a session is issued, and a session is only honoured while its
 * row exists, has not been revoked and has not expired. Ending a session is
 * setting revoked_at, and it takes effect on the next request.
 *
 * Rows hold a SHA-256 of the token, never the token itself, so a copy of the
 * table is not a bag of working cookies. Issue and verify both hash through
 * hashSessionToken, so they cannot drift apart.
 */

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Whether a token that has already passed its signature check still has a
 * live row, belonging to the clinician the token names.
 *
 * Fails closed: if the table cannot be read, the session is refused. The
 * expiry comparison happens in the query, because expires_at is a timestamp
 * without a time zone written from a UTC string, and comparing it in
 * JavaScript would depend on the server's own time zone.
 */
export async function sessionIsLive(token: string, clinicianId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .select("clinician_id")
    .eq("token", hashSessionToken(token))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error(
      "[sessions] could not check a session, so it is refused. If this is a " +
        "missing column, apply migrations/015_revocable_sessions.sql.",
      error
    );
    return false;
  }
  return data?.clinician_id === clinicianId;
}

type Revoked = { ok: true; revoked: number } | { ok: false };

/** Ends one session, the one this token belongs to. */
export async function revokeSession(token: string): Promise<Revoked> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token", hashSessionToken(token))
    .is("revoked_at", null)
    .select("id");

  if (error) {
    console.error("[sessions] could not revoke a session", error);
    return { ok: false };
  }
  return { ok: true, revoked: data?.length ?? 0 };
}

/**
 * Ends every live session a clinician holds, on every device.
 *
 * Only rows that are unrevoked and unexpired are touched, so the count is the
 * number of sessions that were actually still working.
 */
export async function revokeSessionsForClinician(clinicianId: string): Promise<Revoked> {
  const { data, error } = await supabaseAdmin
    .from("sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("clinician_id", clinicianId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error(`[sessions] could not revoke sessions for ${clinicianId}`, error);
    return { ok: false };
  }
  return { ok: true, revoked: data?.length ?? 0 };
}
