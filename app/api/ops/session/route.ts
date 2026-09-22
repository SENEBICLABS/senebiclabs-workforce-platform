import { NextRequest, NextResponse } from "next/server";
import { OPS_COOKIE, SESSION_HOURS, issueOpsToken, keyIsValid } from "@/lib/ops-auth";

export const dynamic = "force-dynamic";

/**
 * Exchanges the operator key for a short-lived cookie.
 *
 * The cookie carries a signed token, not the key, so the key itself is never
 * stored in the browser and a stolen cookie expires on its own.
 */
export async function POST(req: NextRequest) {
  let key: string | null = null;
  try {
    key = String((await req.json())?.key ?? "");
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (!keyIsValid(key)) {
    return NextResponse.json({ error: "That key is not valid." }, { status: 403 });
  }

  let token: string;
  try {
    token = await issueOpsToken();
  } catch (err) {
    console.error("[ops] cannot issue an operator session", err);
    return NextResponse.json({ error: "The console is not configured." }, { status: 503 });
  }

  const res = NextResponse.json({ unlocked: true });
  res.cookies.set(OPS_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
  return res;
}

/** Locks the console again. */
export async function DELETE() {
  const res = NextResponse.json({ locked: true });
  res.cookies.set(OPS_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return res;
}
