import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createAccessRequest, parseAccessRequest } from "@/lib/access-requests";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * A clinician asking for an invitation.
 *
 * Public and unauthenticated, so it is built to give nothing away and to be
 * useless for abuse:
 *
 *   - It answers the same "received" whether the request was stored, the
 *     address already has an account, or a request from it is already waiting.
 *     Anything else would let a stranger test whether a named clinician works
 *     with us.
 *   - It emails the address it was given once, and only when a request is
 *     actually stored, so repeating a submission cannot flood an inbox. That
 *     email carries a link that removes the address, for anyone added by
 *     somebody else.
 *   - It requires a Cloudflare Turnstile check, so a flood of automated
 *     submissions cannot fill the list with invented people.
 *   - It is rate limited per client and per address, and carries a honeypot
 *     field that people never see and form-filling bots tend to complete.
 */

const RECEIVED = { success: true };

const tooMany = (retryAfter: number) =>
  NextResponse.json(
    { error: "Too many requests. Please try again a little later." },
    { status: 429, headers: { "retry-after": String(retryAfter) } }
  );

export async function POST(req: NextRequest) {
  const byClient = rateLimit(`access:ip:${clientIp(req)}`, { max: 5, windowSeconds: 3600 });
  if (!byClient.ok) return tooMany(byClient.retryAfter);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // The honeypot. A person never sees this field; a bot that fills every input
  // it finds gets the same answer as anyone else, and nothing is stored.
  const honeypot = (body as Record<string, unknown> | null)?.website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return NextResponse.json(RECEIVED);
  }

  const parsed = parseAccessRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // The bot check. After validation, because Cloudflare accepts each token only
  // once and a typo in a field should not spend it; before anything counts
  // against the address or touches the database.
  const human = await verifyTurnstile((body as Record<string, unknown>).turnstile_token);
  if (!human.ok) {
    return human.reason === "unavailable"
      ? NextResponse.json(
          { error: "We could not check your request just now. Please try again in a moment." },
          { status: 503 }
        )
      : NextResponse.json(
          { error: "Please complete the security check and try again." },
          { status: 400 }
        );
  }

  const byAddress = rateLimit(`access:addr:${parsed.value.email}`, {
    max: 3,
    windowSeconds: 86_400,
  });
  if (!byAddress.ok) return tooMany(byAddress.retryAfter);

  const result = await createAccessRequest(parsed.value);
  if (!result.ok) {
    return NextResponse.json(
      { error: "We could not send your request just now. Please try again in a moment." },
      { status: 503 }
    );
  }

  return NextResponse.json(RECEIVED);
}
