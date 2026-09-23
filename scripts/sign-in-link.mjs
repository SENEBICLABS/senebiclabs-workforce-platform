import { randomBytes } from "crypto";
import { SignJWT } from "jose";

/**
 * A sign-in link token, built exactly as lib/auth.ts builds one.
 *
 * The scripts used to POST /api/auth/magic-link and read the link out of the
 * response. That endpoint is now /api/auth/sign-in-link and it deliberately
 * returns nothing but a neutral acknowledgement: the link goes to the mailbox
 * and nowhere else, so that asking about an address tells you nothing about
 * whether it can sign in. Reading a link out of an HTTP response is exactly the
 * leak that change closed, so this does not reintroduce it.
 *
 * What it does instead is sign the same JWT the app would sign, with the same
 * secret from the same .env.local. Everything the link touches on the way in
 * stays under test: /api/auth/verify still verifies the signature, still spends
 * the jti against sign_in_tokens so a replay is refused, and still puts the
 * address through the gate.
 */
export function signInLinkFor(env, email, minutes = 15) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(`${minutes}m`)
    .sign(new TextEncoder().encode(env.MAGIC_LINK_SECRET));
}
