import "server-only";
import { supabaseAdmin } from "./supabase";
import { normalizeEmail } from "./invites";
import { findClinicianByEmail } from "./clinicians";
import { escapeHtml } from "./send-invite";

/**
 * Access requests: how someone without an invitation asks for one.
 *
 * A request comes from someone who found the site. It is unverified input from
 * a stranger: it creates no account, grants no access and is never emailed back
 * to the address it names. An operator reads it and marks it reviewed.
 *
 * It has nothing to do with invites. If there is someone we want, we reach out
 * ourselves and send an invitation the ordinary way. Nothing here can create
 * one, so the public form is never a path into the invite machinery.
 *
 * It asks only for what a stranger can reasonably be asked: name, email,
 * specialty and country, and optionally a LinkedIn profile. Credentials are a
 * question for the conversation that follows a promising request.
 */

export interface AccessRequestInput {
  full_name: string;
  /** Personal or work, whichever they check. Only lowercased, never judged. */
  email: string;
  specialty: string;
  country: string;
  linkedin_url: string | null;
}

export interface AccessRequest extends AccessRequestInput {
  id: string;
  status: "pending" | "reviewed";
  created_at: string;
  reviewed_at: string | null;
}

/** Mirrors the CHECK constraints in migrations 012 to 014. */
const LIMITS: Record<keyof AccessRequestInput, number> = {
  full_name: 120,
  email: 254,
  specialty: 120,
  country: 80,
  linkedin_url: 500,
};

const REQUIRED: [keyof AccessRequestInput, string][] = [
  ["full_name", "your name"],
  ["email", "your email"],
  ["specialty", "your specialty"],
  ["country", "the country you practise in"],
];

const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/**
 * A LinkedIn profile link, normalised, or a reason to refuse it.
 *
 * People paste these every which way — with or without https://, with www.,
 * with a country subdomain — so a bare "linkedin.com/in/name" is accepted and
 * given a scheme. What is not accepted is anything off linkedin.com. The link
 * is rendered in the operator console, so this is what keeps a javascript: URL
 * or a lookalike host such as linkedin.com.example.org out of it. The table's
 * CHECK holds the same line.
 */
function parseLinkedIn(raw: string): { ok: true; url: string | null } | { ok: false } {
  if (!raw) return { ok: true, url: null };

  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
  const host = url.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return { ok: false };

  url.protocol = "https:";
  return { ok: true, url: url.toString() };
}

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

  const linkedin = parseLinkedIn(text("linkedin_url"));
  if (!linkedin.ok) {
    return { ok: false, error: "That does not look like a LinkedIn profile link." };
  }

  return {
    ok: true,
    value: {
      full_name: text("full_name"),
      email,
      specialty: text("specialty"),
      country: text("country"),
      linkedin_url: linkedin.url,
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
 * Marks a request reviewed, taking it off the pending list.
 *
 * It records only that someone has looked at it. Whether to reach out, and
 * whether to invite, happens outside this table. Nobody is notified.
 * Conditional on still being pending, so two operators cannot both close it.
 */
export async function markAccessRequestReviewed(
  id: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("access_requests")
    .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) {
    console.error("[access-requests] mark reviewed failed", error);
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
              ${row("Country", r.country)}
              ${row("LinkedIn", r.linkedin_url)}
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
