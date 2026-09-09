/**
 * Signing secrets, loaded once and refused if they are not real.
 *
 * This file exists because three different places used to fall back to a
 * literal when their environment variable was missing:
 *
 *   middleware.ts        "missing-jwt-secret"
 *   lib/auth.ts          process.env.JWT_SECRET!  -> encodes "undefined"
 *   lib/google-oauth.ts  "dev"
 *
 * Each of those is a publicly known constant sitting in a public repository.
 * With any of them in play an attacker can mint a session for any clinician,
 * or an ops token, simply by signing one themselves. A missing secret has to
 * stop the process, not quietly downgrade it to a shared password.
 *
 * No node imports here: middleware runs on the edge runtime and imports this
 * too, so it stays to process.env and TextEncoder.
 */

/** Below this a brute force against an HS256 signature stops being absurd. */
const MIN_LENGTH = 32;

const cache = new Map<string, Uint8Array>();

function load(name: string): Uint8Array {
  const cached = cache.get(name);
  if (cached) return cached;

  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set. Authentication cannot run without it: every session ` +
        `token is signed with this value, and a fallback would mean anyone who ` +
        `read the source could forge one.`
    );
  }
  if (value.length < MIN_LENGTH) {
    throw new Error(
      `${name} is ${value.length} characters. It must be at least ${MIN_LENGTH}. ` +
        `Generate one with: openssl rand -base64 48`
    );
  }

  const encoded = new TextEncoder().encode(value);
  cache.set(name, encoded);
  return encoded;
}

/** Signs clinician sessions. */
export const jwtSecret = () => load("JWT_SECRET");

/** Signs sign-in link tokens. Separate, so a leak of one is not a leak of
 *  both. The env name still reads MAGIC_LINK because it is already set in
 *  production and renaming it would break sign-in on deploy. */
export const magicLinkSecret = () => load("MAGIC_LINK_SECRET");

/**
 * Signs the OAuth state parameter.
 *
 * Its own secret rather than borrowing another. State is handed to a third
 * party and comes back through the user's browser, which is a different
 * exposure from a cookie we set and read ourselves.
 */
export const oauthStateSecret = () =>
  process.env.OAUTH_STATE_SECRET ? load("OAUTH_STATE_SECRET") : load("MAGIC_LINK_SECRET");

/**
 * Whether every secret needed to sign in is present and long enough.
 *
 * Used by the health check and by middleware, which cannot throw its way to a
 * useful error and has to refuse instead.
 */
export function authSecretsReady(): { ok: true } | { ok: false; problem: string } {
  for (const name of ["JWT_SECRET", "MAGIC_LINK_SECRET"]) {
    try {
      load(name);
    } catch (err) {
      return { ok: false, problem: (err as Error).message };
    }
  }
  return { ok: true };
}
