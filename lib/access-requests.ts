import "server-only";
import { supabaseAdmin } from "./supabase";
import { createAndSendInvite, normalizeEmail } from "./invites";
import { findClinicianByEmail } from "./clinicians";
import { escapeHtml } from "./send-invite";

/**
 * Access requests: how someone without an invitation asks for one.
 *
 * A request is unverified input from a stranger. It creates no account, grants
 * no access and is never emailed back to the address it names. An operator
 * reads it, and if there is work that fits, sends an ordinary invitation. The
 * invitation remains the only thing that makes an account.
 */

export interface AccessRequestInput {
  full_name: string;
  email: string;
  specialty: string;
  credential: string;
  country: string;
  profile_url: string | null;
  referred_by: string | null;
}

export interface AccessRequest extends AccessRequestInput {
  id: string;
  status: "pending" | "invited" | "declined";
  created_at: string;
  reviewed_at: string | null;
  invite_id: string | null;
}

/** Mirrors the CHECK constraints in migration 012, so the API refuses first and politely. */
const LIMITS: Record<keyof AccessRequestInput, number> = {
  full_name: 120,
  email: 254,
  specialty: 120,
  credential: 120,
  country: 80,
  profile_url: 500,
  referred_by: 120,
};

const REQUIRED: [keyof AccessRequestInput, string][] = [
  ["full_name", "your name"],
  ["email", "your email"],
  ["specialty", "your specialty"],
  ["credential", "your credential or licence type"],
  ["country", "your country of practice"],
];

const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/** Validates and normalises a submitted request. */
export function parseAccessRequest(
  body: unknown
): { ok: true; value: AccessRequestInput } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof b[key] === "string" ? (b[key] as string).trim() : "");

  for (const [key, label] of REQUIRED) {
    if (!text(key)) return { ok: false, error: `Please add ${label}.` };
  }
  for (const [key, max] of Object.entries(LIMITS)) {
    if (text(key).length > max) return { ok: false, error: "One of those answers is too long." };
  }

  const email = normalizeEmail(text("email"));
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return { ok: false, error: "That does not look like an email address." };
  }

  // Only http(s). The console renders this as a link, so a javascript: URL
  // here would be stored script waiting for an operator to click it.
  const profile = text("profile_url");
  if (profile && !/^https?:\/\/\S+$/i.test(profile)) {
    return { ok: false, error: "The profile link should start with https://." };
  }

  return {
    ok: true,
    value: {
      full_name: text("full_name"),
      email,
      specialty: text("specialty"),
      credential: text("credential"),
      country: text("country"),
      profile_url: profile || null,
      referred_by: text("referred_by") || null,
    },
  };
}

/**
 * Records a request.
 *
 * Returns ok for three different outcomes, and the caller answers all three
 * identically: stored, already a member, or already waiting. Distinguishing
 * them would let anyone test whether a named clinician works with us, or has
 * already asked to.
 */
export async function createAccessRequest(
  input: AccessRequestInput
): Promise<{ ok: true; stored: boolean } | { ok: false }> {
  if (await findClinicianByEmail(input.email)) return { ok: true, stored: false };

  const { error } = await supabaseAdmin
    .from("access_requests")
    .insert({ ...input, status: "pending" });

  if (error) {
    // A request from this address is already waiting.
    if (error.code === "23505") return { ok: true, stored: false };
    console.error("[access-requests] insert failed", error);
    return { ok: false };
  }

  await notifyOperator(input);
  return { ok: true, stored: true };
}

/** Requests waiting for a decision, newest first. */
export async function listPendingAccessRequests(): Promise<AccessRequest[]> {
  const { data, error } = await supabaseAdmin
    .from("access_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[access-requests] list failed", error);
    return [];
  }
  return (data ?? []) as AccessRequest[];
}

/**
 * Sends an ordinary invitation to the address on a request, then closes it.
 *
 * The invitation goes first and the request is closed after, because the
 * invitation is the thing that matters and createAndSendInvite already guards
 * every failure that could leave it half-done. Two operators clicking Invite at
 * once cannot send two: the second collides with the first invitation on the
 * one-pending-invite index and is told so.
 */
export async function inviteFromRequest(
  id: string
): Promise<{ ok: true; email: string } | { ok: false; status: number; error: string }> {
  const { data: request } = await supabaseAdmin
    .from("access_requests")
    .select("id, email, status")
    .eq("id", id)
    .maybeSingle();

  if (!request) return { ok: false, status: 404, error: "That request no longer exists." };
  if (request.status !== "pending") {
    return { ok: false, status: 409, error: `That request has already been ${request.status}.` };
  }

  const sent = await createAndSendInvite(request.email as string, null, "Senebiclabs");
  if (!sent.ok) return { ok: false, status: sent.status, error: sent.error };

  // Conditional on still being pending, as consumeInvite is. If it changed
  // underneath us the invitation still stands; only the bookkeeping raced.
  const { data: closed } = await supabaseAdmin
    .from("access_requests")
    .update({ status: "invited", reviewed_at: new Date().toISOString(), invite_id: sent.invite.id })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (!closed?.length) {
    console.warn(`[access-requests] ${id} changed state while its invitation was being sent`);
  }
  return { ok: true, email: request.email as string };
}

/**
 * Declines a request. Nobody is notified: declining is a decision about the
 * work we have now, not a verdict to deliver to a clinician.
 */
export async function declineAccessRequest(
  id: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("access_requests")
    .update({ status: "declined", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("[access-requests] decline failed", error);
    return { ok: false, status: 500, error: "That did not save." };
  }
  if (!data?.length) return { ok: false, status: 409, error: "That request is no longer pending." };
  return { ok: true };
}

/* ── operator notification ───────────────────────────────────────── */

const NOTIFY_EMAIL = process.env.ACCESS_REQUEST_NOTIFY_EMAIL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "noreply@senebiclabs.com";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

/**
 * Tells the operator a request has arrived.
 *
 * Off unless ACCESS_REQUEST_NOTIFY_EMAIL is set. It only ever mails that one
 * fixed address, never the requester, so the public form cannot be turned
 * into a relay for sending our mail to strangers. reply_to is the requester,
 * so answering the notification writes to them directly.
 *
 * Best-effort by design. A failed notification does not fail the request: the
 * request is already stored and visible in /ops, and telling a clinician their
 * request failed because our inbox did would be both untrue and unhelpful.
 */
async function notifyOperator(r: AccessRequestInput): Promise<void> {
  if (!NOTIFY_EMAIL || !RESEND_API_KEY) return;

  const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ");
  const row = (label: string, value: string | null) =>
    value
      ? `<tr><td style="padding:4px 12px 4px 0;color:#5B6A68">${label}</td><td style="padding:4px 0">${escapeHtml(value)}</td></tr>`
      : "";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: NOTIFY_EMAIL,
        reply_to: r.email,
        subject: oneLine(`Access request: ${r.full_name}, ${r.specialty}`),
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;padding:24px;color:#10312E">
            <p style="font-size:16px;font-weight:600;margin:0 0 16px">New access request</p>
            <table style="font-size:14px;border-collapse:collapse">
              ${row("Name", r.full_name)}
              ${row("Email", r.email)}
              ${row("Specialty", r.specialty)}
              ${row("Credential", r.credential)}
              ${row("Country", r.country)}
              ${row("Profile", r.profile_url)}
              ${row("Referred by", r.referred_by)}
            </table>
            <p style="font-size:14px;margin:20px 0 0">
              Review it in the <a href="${APP_URL}/ops">operator console</a>.
            </p>
          </div>`,
      }),
    });
    if (!res.ok) console.error("[access-requests] notification rejected", res.status, await res.text());
  } catch (err) {
    console.error("[access-requests] notification failed", err);
  }
}
