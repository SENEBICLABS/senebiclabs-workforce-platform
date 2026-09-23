import { createHash, randomBytes } from "crypto";

/**
 * An invitation this test can actually accept.
 *
 * Two things stand between a script and a usable invite, and both are the
 * product being right rather than the product being awkward:
 *
 *   1. Invite tokens are SHA-256 hashed at rest. The raw token exists only in
 *      the email, so no amount of reading the table gets it back.
 *   2. /api/invites allows five invitations per ten minutes per sender, to
 *      protect email sending reputation. A suite run twice in a row meets it.
 *
 * So this asks the endpoint first, which is what keeps the endpoint covered,
 * and then plants a token whose hash it knows into the pending row. If the
 * endpoint declined for any reason, including the burst limit, it writes the
 * row itself and says so, because the thing under test in the calling script
 * is pool eligibility, not invitation throttling.
 *
 * Nothing here weakens what is being tested downstream: /api/auth/verify still
 * hashes the token it is handed and matches it against the column, and the
 * gate still decides whether the address may have an account.
 */
export async function plantInvite(env, { q, qj, app }, email) {
  const created = await fetch(`${app}/api/invites`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-ops-key": env.OPS_API_KEY },
    body: JSON.stringify({ email }),
  });

  const raw = randomBytes(24).toString("base64url");
  const token_hash = createHash("sha256").update(raw).digest("hex");
  const where = `invited_email=eq.${encodeURIComponent(email)}&status=eq.pending`;

  const [pending] = await qj(`invites?${where}&select=id`);

  if (pending) {
    await q(`invites?id=eq.${pending.id}`, {
      method: "PATCH",
      body: JSON.stringify({ token_hash }),
    });
  } else {
    const [inviter] = await qj("clinicians?select=id&order=created_at.asc&limit=1");
    await q("invites", {
      method: "POST",
      body: JSON.stringify({
        token_hash,
        invited_email: email,
        invited_by: inviter.id,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    });
  }

  return { raw, status: created.status, sent: created.status === 200 };
}
