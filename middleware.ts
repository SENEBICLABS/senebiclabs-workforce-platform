import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { authSecretsReady, jwtSecret } from "@/lib/secrets";

/**
 * Edge guards for two very different surfaces.
 *
 * /ops — the operator console. A clinician session is never consulted here, so
 * no privilege inside the clinician app reaches it. Only the unlock screen is
 * public. A failure is a 403 REFUSAL, not a redirect: nothing should hint at
 * what it guards.
 *
 * Clinician app — the signed-in pages. A logged-out or expired visitor is
 * REDIRECTED to /login, so they land on a clean sign-in instead of a dashboard
 * shell that renders and then fails its data fetch with "Unauthorized". The API
 * still does the authoritative check; this is purely for a clean logged-out UX.
 * Onboarding routes (/login, /join, /welcome, /auth/verify) stay public.
 */
/**
 * No fallback secret.
 *
 * This used to default to the literal "missing-jwt-secret", which is a public
 * constant in a public repository: with JWT_SECRET unset in an environment,
 * anyone could sign themselves an ops token or a clinician session. If the
 * secret is missing now, nothing is let through.
 */
function secret() {
  return jwtSecret();
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Operator console: refusal, not redirect (unchanged behaviour). ──
  if (pathname === "/ops" || pathname.startsWith("/ops/")) {
    if (pathname === "/ops/unlock") return NextResponse.next();

    const token = req.cookies.get("ops_session")?.value;
    const configured = Boolean(process.env.OPS_API_KEY) && authSecretsReady().ok;
    if (token && configured) {
      try {
        const { payload } = await jwtVerify(token, secret());
        if (payload.ops === true) return NextResponse.next();
      } catch {
        /* fall through to the refusal */
      }
    }
    return new NextResponse(
      JSON.stringify({ error: "Not authorised." }),
      { status: 403, headers: { "content-type": "application/json" } }
    );
  }

  // ── Clinician app: redirect a logged-out / expired visitor to sign-in. ──
  const session = req.cookies.get("sessionToken")?.value;
  if (session && authSecretsReady().ok) {
    try {
      await jwtVerify(session, secret());
      return NextResponse.next(); // valid session — let the page render
    } catch {
      /* expired or invalid — treat as logged out */
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/ops", "/ops/:path*",
    "/dashboard", "/dashboard/:path*",
    "/queue", "/queue/:path*",
    "/workspace", "/workspace/:path*",
    "/account", "/account/:path*",
    "/earnings", "/earnings/:path*",
  ],
};
