import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { jwtSecret } from "./secrets";

/**
 * The operator gate.
 *
 * /ops is not part of the clinician application. It is reached by holding the
 * operator key and by nothing else — no clinician session grants it, and no
 * amount of privilege inside the clinician app escalates into it, because the
 * clinician session is never consulted here.
 *
 * Two ways to present the key: the raw header, for scripts and curl, or a
 * short-lived cookie the unlock screen sets so an operator types it once. The
 * cookie holds a signed token rather than the key itself, so the key is never
 * stored in the browser.
 */

const OPS_COOKIE = "ops_session";
const SESSION_HOURS = 8;

/**
 * The fail-closed secret from lib/secrets.ts, as clinician sessions use.
 *
 * This used to fall back to the literal "missing-jwt-secret", a public
 * constant: with JWT_SECRET unset, anyone could sign an operator cookie. Now a
 * missing or short secret throws. Verification treats that as a refusal, and
 * the unlock route reports the console as unconfigured.
 */
const secret = () => jwtSecret();

export async function issueOpsToken(): Promise<string> {
  return new SignJWT({ ops: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

export async function verifyOpsToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.ops === true;
  } catch {
    return false;
  }
}

/** Constant-time comparison, so the key cannot be probed a character at a time. */
function keyMatches(presented: string, expected: string): boolean {
  if (presented.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < presented.length; i++) {
    diff |= presented.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function presentedKey(req: NextRequest): string | null {
  return (
    req.headers.get("x-ops-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null
  );
}

export function keyIsValid(presented: string | null): boolean {
  const expected = process.env.OPS_API_KEY;
  if (!expected || !presented) return false;
  return keyMatches(presented, expected);
}

/**
 * Whether this request may act as the operator.
 *
 * Checked on every ops request rather than once at sign-in, so a revoked key
 * stops working immediately for headers, and within the session lifetime for
 * the cookie.
 */
export async function isOperator(req: NextRequest): Promise<boolean> {
  if (keyIsValid(presentedKey(req))) return true;

  const cookie = req.cookies.get(OPS_COOKIE)?.value;
  if (!cookie) return false;

  // A cookie is only worth honouring while a key is configured at all.
  if (!process.env.OPS_API_KEY) return false;
  return verifyOpsToken(cookie);
}

/** Says nothing about what exists behind the gate. */
export const OPS_FORBIDDEN = () =>
  NextResponse.json({ error: "Not authorised." }, { status: 403 });

/**
 * Wraps an ops handler in the gate.
 *
 * Every /api/ops route goes through this, so authorisation cannot be forgotten
 * on a new endpoint by omission.
 */
export async function withOps(
  req: NextRequest,
  handler: () => Promise<Response>
): Promise<Response> {
  if (!(await isOperator(req))) return OPS_FORBIDDEN();
  return handler();
}

export { OPS_COOKIE, SESSION_HOURS };
