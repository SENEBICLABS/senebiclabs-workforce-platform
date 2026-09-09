import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import {
  authorizeUrl,
  buildState,
  googleConfigured,
  OAUTH_NONCE_COOKIE,
} from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * Starts Google sign-in.
 *
 * Mints a nonce, puts it in the signed state and in an httpOnly cookie. The
 * callback refuses unless both come back and agree, which is what stops an
 * attacker starting a flow of their own and finishing it in someone else's
 * browser.
 */
export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(
      new URL("/login?error=google_unavailable", req.url)
    );
  }

  const invite = new URL(req.url).searchParams.get("invite");
  const nonce = randomBytes(32).toString("base64url");

  const res = NextResponse.redirect(authorizeUrl(await buildState(invite, nonce)));

  res.cookies.set(OAUTH_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // The cookie has to survive the cross-site redirect back from Google, so
    // it cannot be "strict". Lax still withholds it from cross-site POSTs.
    sameSite: "lax",
    path: "/",
    // Slightly longer than the state's own 15 minutes, so an expired state is
    // reported as expired rather than as a missing nonce.
    maxAge: 20 * 60,
  });

  return res;
}
