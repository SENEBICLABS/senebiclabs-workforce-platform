import { createHash, randomBytes } from "crypto";
import { SignJWT } from "jose";

/**
 * A session for a verification script, issued the way the gate issues one: a
 * signed token and the sessions row that makes it honoured.
 *
 * Sessions are revocable, so verifySessionToken refuses a validly signed token
 * that has no live row. Scripts used to sign a token and nothing else, which
 * after that change is exactly the forged-looking token the check exists to
 * refuse: every request came back 401. The token carries a jti so repeated
 * runs never collide on the unique token column.
 */
export async function sessionFor(env, { clinicianId, email }) {
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  const token = await new SignJWT({ clinicianId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt()
    .setExpirationTime(Math.floor(expires.getTime() / 1000))
    .sign(new TextEncoder().encode(env.JWT_SECRET));

  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sessions`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      clinician_id: clinicianId,
      token: createHash("sha256").update(token).digest("hex"),
      expires_at: expires.toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`could not record a session row: ${res.status} ${await res.text()}`);
  return token;
}
