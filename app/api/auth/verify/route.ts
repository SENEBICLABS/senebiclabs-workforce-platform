import { NextRequest, NextResponse } from "next/server";
import { consumeSignInLink } from "@/lib/auth";
import { GATE_MESSAGE, signInOrReject } from "@/lib/auth-gate";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * Exchanges a sign-in link token for a session.
 *
 * Proving control of an address is not the same as being allowed in: the token
 * establishes the address, and the gate decides whether it may have an account.
 * An invite token may ride along when the link was opened from /join.
 */
export async function POST(req: NextRequest) {
  let token: string | undefined;
  let invite: string | null = null;

  try {
    const body = await req.json();
    token = body?.token;
    invite = typeof body?.invite === "string" ? body.invite : null;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ error: "No token provided" }, { status: 400 });
  }

  try {
    const link = await consumeSignInLink(token);

    if (!link.ok) {
      // "unavailable" means the token store could not be reached, which is our
      // fault rather than theirs, and is retryable.
      if (link.reason === "unavailable") {
        return NextResponse.json(
          { error: "We could not sign you in just now. Please try again in a moment." },
          { status: 503 }
        );
      }
      return NextResponse.json(
        {
          error:
            link.reason === "used"
              ? "This link has already been used. Request a new one."
              : "This link is no longer valid. Request a new one.",
        },
        { status: 401 }
      );
    }

    // A single-use link was consumed at this address, which is what vouches
    // for it here.
    const result = await signInOrReject({
      kind: "authenticated",
      email: link.email,
      invite,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: GATE_MESSAGE[result.reason], reason: result.reason },
        { status: result.reason === "unavailable" ? 503 : 403 }
      );
    }

    const response = NextResponse.json({
      success: true,
      email: result.email,
      created: result.created,
    });

    response.cookies.set(SESSION_COOKIE, result.sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error("[verify] failed", error);
    return NextResponse.json(
      { error: "We could not sign you in. Try again in a moment." },
      { status: 500 }
    );
  }
}
