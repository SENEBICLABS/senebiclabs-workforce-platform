import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCode,
  googleConfigured,
  nonceMatches,
  OAUTH_NONCE_COOKIE,
  readState,
} from "@/lib/google-oauth";
import { signInOrReject } from "@/lib/auth-gate";
import { SESSION_COOKIE } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

/**
 * Google's redirect back.
 *
 * Nothing here decides who may have an account — it establishes which address
 * Google vouched for, then hands that to the same gate a sign-in link uses.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  const back = (params: string) =>
    NextResponse.redirect(new URL(`/login?${params}`, req.url));

  if (denied) return back("error=google_cancelled");
  if (!googleConfigured()) return back("error=google_unavailable");
  if (!code || !state) return back("error=google_failed");

  const carried = await readState(state);
  if (!carried) return back("error=google_failed");

  // The state must have been minted for THIS browser. Without this the flow is
  // vulnerable to login CSRF: a signed state is not evidence of who asked for
  // it, only that this server produced it.
  const nonce = req.cookies.get(OAUTH_NONCE_COOKIE)?.value;
  if (!nonceMatches(carried.nonce, nonce)) {
    return back("error=google_failed");
  }

  let identity;
  try {
    identity = await exchangeCode(code);
  } catch (err) {
    console.error("[google] exchange failed", err);
    return back("error=google_failed");
  }

  // An unverified Google address proves nothing about who controls it.
  if (!identity.emailVerified) return back("error=email_unverified");

  const result = await signInOrReject(identity.email, carried.invite);

  if (!result.ok) {
    const where = carried.invite
      ? `/join?token=${encodeURIComponent(carried.invite)}&error=${result.reason}`
      : `/login?error=${result.reason}`;
    return NextResponse.redirect(new URL(where, req.url));
  }

  const res = NextResponse.redirect(
    new URL(result.created ? "/welcome" : "/dashboard", req.url)
  );
  // Spent: one nonce, one round trip.
  res.cookies.set(OAUTH_NONCE_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, result.sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}
