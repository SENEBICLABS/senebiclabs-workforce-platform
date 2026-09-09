import "server-only";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { oauthStateSecret } from "./secrets";

/**
 * Google sign-in, as a plain OAuth2 code flow.
 *
 * Rolled directly rather than through an auth library so both sign-in methods
 * end at the same gate and issue the same session cookie. A second library
 * would bring its own session and its own idea of who may hold an account,
 * which is exactly the thing invite-only access cannot afford.
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
export const GOOGLE_REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

export const googleConfigured = () => Boolean(CLIENT_ID && CLIENT_SECRET);

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);

/** The cookie holding the nonce that binds a state to one browser. */
export const OAUTH_NONCE_COOKIE = "oauth_nonce";

/**
 * Signed state, carrying the invite token and a nonce through the round trip.
 *
 * The signature alone was never CSRF protection, though it used to claim to
 * be. Anyone could call /api/auth/google, be handed a validly signed state,
 * and feed it to the callback: the token proved only that this server minted
 * it, not that it was minted for the browser presenting it. That is login
 * CSRF, and it lets an attacker complete a flow that silently signs a victim
 * into the attacker's account.
 *
 * The nonce fixes it. Half lives in the state, half in an httpOnly cookie the
 * attacker cannot set on the victim's browser, and the callback refuses unless
 * they match.
 */
export async function buildState(
  inviteToken: string | null,
  nonce: string
): Promise<string> {
  return new SignJWT({ invite: inviteToken ?? null, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("15m")
    .sign(oauthStateSecret());
}

export async function readState(
  state: string
): Promise<{ invite: string | null; nonce: string | null } | null> {
  try {
    const { payload } = await jwtVerify(state, oauthStateSecret());
    return {
      invite: (payload.invite as string | null) ?? null,
      nonce: (payload.nonce as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** Length-safe comparison, so a mismatch leaks nothing through timing. */
export function nonceMatches(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state,
    // Always show the chooser: a shared machine must not silently reuse an account.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string | null;
}

/** Exchanges the code and verifies the returned id_token against Google's keys. */
export async function exchangeCode(code: string): Promise<GoogleIdentity> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }

  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google returned no id_token");

  const { payload } = await jwtVerify(id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: CLIENT_ID,
  });

  const email = payload.email as string | undefined;
  if (!email) throw new Error("Google returned no email");

  return {
    email,
    emailVerified: payload.email_verified === true,
    name: (payload.name as string | undefined) ?? null,
  };
}
