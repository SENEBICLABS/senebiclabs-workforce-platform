import "server-only";

/**
 * Cloudflare Turnstile: telling people from bots on the public request form.
 *
 * The widget in the browser produces a token; this checks it with Cloudflare
 * before the request is stored. Each token is good once and for a few minutes,
 * so a bot cannot mint one and replay it across a flood of submissions.
 *
 * Fails closed in production. Without TURNSTILE_SECRET_KEY every submission is
 * refused, because a check that silently switches itself off when a variable
 * goes missing is not a check. In development it is skipped with a warning, so
 * the form can be worked on without Cloudflare keys.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare's documented maximum token length. */
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileResult =
  | { ok: true }
  /** No token, or Cloudflare says it is invalid, expired or already used. */
  | { ok: false; reason: "rejected" }
  /** We could not get an answer: not configured, or Cloudflare unreachable. */
  | { ok: false; reason: "unavailable" };

export async function verifyTurnstile(token: unknown): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[turnstile] TURNSTILE_SECRET_KEY is not configured; refusing the request");
      return { ok: false, reason: "unavailable" };
    }
    console.warn("[turnstile] TURNSTILE_SECRET_KEY is not set; skipping the check in development");
    return { ok: true };
  }

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: "rejected" };
  }

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(8000),
    });
    // Read the body whatever the status. Cloudflare answers a bad secret with
    // HTTP 400 and the reason in "error-codes", and that reason is what tells
    // us the fault is our configuration rather than the visitor.
    const data = (await res.json().catch(() => null)) as
      | { success?: boolean; "error-codes"?: string[] }
      | null;
    if (!data) {
      console.error("[turnstile] siteverify returned", res.status, "with no readable body");
      return { ok: false, reason: "unavailable" };
    }
    if (res.ok && data.success === true) return { ok: true };

    const codes = data["error-codes"] ?? [];
    // Cloudflare's own failure is not the visitor's fault; tell them to retry
    // rather than that they failed a check.
    if (codes.includes("internal-error")) return { ok: false, reason: "unavailable" };
    // A wrong or missing secret is ours to fix, and would otherwise read to
    // every visitor as though they had been judged a bot.
    if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
      console.error("[turnstile] the configured secret key was refused:", codes.join(", "));
      return { ok: false, reason: "unavailable" };
    }
    // Only a reason that is about the visitor's token counts as failing the
    // check. Any other failure, including a server error with no codes, is ours
    // or Cloudflare's, and the visitor is told to try again rather than judged.
    const VISITOR_CODES = ["missing-input-response", "invalid-input-response", "timeout-or-duplicate"];
    if (!codes.some((c) => VISITOR_CODES.includes(c))) {
      console.error("[turnstile] siteverify failed without a visitor reason:", res.status, codes.join(", "));
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "rejected" };
  } catch (err) {
    console.error("[turnstile] siteverify failed", err);
    return { ok: false, reason: "unavailable" };
  }
}
