import { NextRequest, NextResponse } from "next/server";
import { signInOrReject, GATE_MESSAGE } from "@/lib/auth-gate";
import { loadInvite } from "@/lib/invites";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Accepts an invitation and signs the clinician straight in.
 *
 * The invite link was emailed to one address and nowhere else, so opening it
 * proves control of that mailbox exactly as a sign-in link does. Making
 * someone then ask for a second email to prove the same thing again is a round
 * trip that buys nothing, and it is where people fall out of a signup.
 *
 * This is a POST, and deliberately not a GET on the /join page load. Corporate
 * mail scanners and link prefetchers follow links in email before a human ever
 * sees them; an invite consumed by a scanner would be spent, and the clinician
 * it was meant for would arrive to "this invitation has already been used".
 * A POST behind a button press cannot be triggered that way.
 *
 * The account itself is still created by the one gate, so an invitation
 * accepted here and one accepted through Google produce the same thing.
 */
export async function POST(req: NextRequest) {
  const { ok, retryAfter } = rateLimit(`invite-accept:${clientIp(req)}`, {
    max: 10,
    windowSeconds: 600,
  });
  if (!ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "retry-after": String(retryAfter) } }
    );
  }

  let token: string | undefined;
  try {
    token = (await req.json())?.token;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "No invitation token." }, { status: 400 });
  }

  const found = await loadInvite(token);
  if (found.problem || !found.invite) {
    const message: Record<string, string> = {
      not_found: "This invitation link is not valid.",
      used: "This invitation has already been used.",
      expired: "This invitation has expired. Ask for a new one.",
      revoked: "This invitation is no longer active.",
    };
    return NextResponse.json(
      { error: message[found.problem ?? "not_found"], reason: found.problem },
      { status: 400 }
    );
  }

  // The token is the credential. Nothing has authenticated anybody: the
  // invitation went to one mailbox and holding the link is the whole proof.
  // The gate reads the address off the invite row itself, so a caller cannot
  // aim someone else's invitation at an address of their own.
  const result = await signInOrReject({ kind: "invite_token", token });

  if (!result.ok) {
    // "unavailable" is our failure, not theirs, and retrying will work once it
    // is fixed. A 403 would tell them they are not allowed in, which is wrong.
    return NextResponse.json(
      { error: GATE_MESSAGE[result.reason], reason: result.reason },
      { status: result.reason === "unavailable" ? 503 : 403 }
    );
  }

  const res = NextResponse.json({
    success: true,
    email: result.email,
    created: result.created,
  });

  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return res;
}
