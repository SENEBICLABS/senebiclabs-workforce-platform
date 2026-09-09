import "server-only";
import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { supabaseAdmin } from "./supabase";
import { jwtSecret, magicLinkSecret } from "./secrets";

/**
 * Sign-in link tokens.
 *
 * The same mechanism as an invite link, for someone who already has an
 * account. An invite creates the account; this signs them back in afterwards.
 *
 * Two things used to be wrong here, and both were invisible from the outside:
 *
 * 1. The link was good for 24 hours and could be replayed the whole time. The
 *    error text already claimed "or has already been used", which was not
 *    true: verification checked a signature and an expiry and nothing else. A
 *    link sitting in a mailbox, a forwarded message or a proxy log was a
 *    working key for a day.
 *
 * 2. createOrGetClinician lived in this file and created an account for any
 *    address handed to it, with no invite anywhere in sight. Nothing called
 *    it, which is the only reason it was not a hole, and it has been deleted
 *    rather than left for someone to wire up in good faith.
 *
 * A link is now single-use and short-lived. Every token carries a jti that is
 * claimed in the database on first use; the second attempt loses the race and
 * is refused.
 */

/**
 * Fifteen minutes. Long enough to open a mail client, short enough that a
 * leaked link is usually already dead.
 */
const EXPIRY_MINUTES = (() => {
  // Env names keep "MAGIC_LINK": they are already set in production and
  // renaming them would break sign-in the moment this deploys.
  const raw = parseInt(process.env.MAGIC_LINK_EXPIRY_MINUTES ?? "", 10);
  return Number.isFinite(raw) && raw > 0 && raw <= 60 ? raw : 15;
})();

export const SIGN_IN_LINK_EXPIRY_MINUTES = EXPIRY_MINUTES;

/** Tokens are stored as hashes, so the table is not a bag of working keys. */
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSignInLink(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(`${EXPIRY_MINUTES}m`)
    .sign(magicLinkSecret());
}

export type SignInLinkFailure = "invalid" | "used" | "unavailable";

/**
 * Verifies a sign-in link and spends it.
 *
 * The claim is an insert against a unique jti, so two requests carrying the
 * same link race and exactly one wins. Fails closed: if the table is missing
 * the sign-in is refused rather than silently falling back to the replayable
 * behaviour this was written to remove.
 */
export async function consumeSignInLink(
  token: string
): Promise<{ ok: true; email: string } | { ok: false; reason: SignInLinkFailure }> {
  let email: string;
  let jti: string;
  let expiresAt: string;

  try {
    const { payload } = await jwtVerify(token, magicLinkSecret());
    if (typeof payload.email !== "string" || typeof payload.jti !== "string") {
      return { ok: false, reason: "invalid" };
    }
    email = payload.email;
    jti = payload.jti;
    expiresAt = new Date((payload.exp ?? 0) * 1000).toISOString();
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const { error } = await supabaseAdmin.from("sign_in_tokens").insert({
    jti: hash(jti),
    email,
    expires_at: expiresAt,
  });

  if (error) {
    // 23505: this link has already been spent.
    if (error.code === "23505") return { ok: false, reason: "used" };

    // 42P01 / PGRST205: migration 008 has not been applied. Refusing is the
    // only safe answer, because the alternative is accepting a link that can
    // then be replayed for the rest of its life.
    console.error(
      "[sign-in-link] could not claim token. If this is a missing relation, " +
        "apply migrations/008_sign_in_tokens.sql.",
      error
    );
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, email };
}

/**
 * Verifies a session token's signature.
 *
 * Signed with JWT_SECRET, not the sign-in link secret: different lifetime and a
 * different blast radius, so a leak of one is not a leak of both.
 */
export async function verifySessionToken(
  token: string
): Promise<{ clinicianId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret());
    if (typeof payload.clinicianId !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { clinicianId: payload.clinicianId, email: payload.email };
  } catch {
    return null;
  }
}
