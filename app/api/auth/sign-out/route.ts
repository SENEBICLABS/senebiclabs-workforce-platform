import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/sessions";

/**
 * Signs out: ends the session itself, then clears the cookie.
 *
 * Clearing the cookie on its own only removed this browser's copy. The token
 * stayed valid for the rest of its seven days, so a copy anywhere else — a
 * second device, a proxy log, a stolen cookie — kept working after sign-out.
 * Revoking the row ends every copy on its next request.
 *
 * The cookie is cleared whatever happens to the revocation, so the person is
 * signed out of this browser either way; a failure to revoke is logged rather
 * than shown, because there is nothing they could do about it.
 */
export async function POST(req: NextRequest) {
  const token =
    req.cookies.get("sessionToken")?.value ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (token) {
    const result = await revokeSession(token);
    if (!result.ok) {
      console.error("[sign-out] the session could not be revoked; the cookie is still cleared");
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("sessionToken", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
