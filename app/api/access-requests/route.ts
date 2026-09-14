import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createAccessRequest, parseAccessRequest } from "@/lib/access-requests";

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
 *   - It never emails the address it was given. The only mail it can cause
 *     goes to one fixed operator inbox, so it cannot be used to send our mail
 *     to strangers.
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
