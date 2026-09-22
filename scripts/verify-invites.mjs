/**
 * Evidence for invite-only auth. Run after migrations/003_invites.sql is applied.
 *
 *   node scripts/verify-invites.mjs
 *
 * Uses plus-addressed variants of the founder's address so the invites go to a
 * real, deliverable inbox without inventing fake domains (Resend rejects
 * example.com, and rightly).
 */
import fs from "fs";
import { sessionFor } from "./session-for.mjs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const APP = "http://localhost:3000";
const SB = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
const q = (p, i = {}) => fetch(`${SB}/${p}`, { headers: H, ...i });
const qj = (p, i = {}) => q(p, i).then((r) => r.json());
const hr = (t) => console.log(`\n${"═".repeat(70)}\n${t}\n${"═".repeat(70)}`);

const FOUNDER = "godwinyampoi449@gmail.com";
const stamp = Date.now().toString().slice(-6);
const INVITEE = `godwinyampoi449+ml${stamp}@gmail.com`;
const UNINVITED = `godwinyampoi449+un${stamp}@gmail.com`;

/* ── 1. migration state ─────────────────────────────────────────── */
hr("1. MIGRATION + PERMISSION DEFAULTS");
const invitesOk = (await q("invites?select=id&limit=1")).status;
console.log(`  invites table                     HTTP ${invitesOk}`);
if (invitesOk === 404) {
  console.log("\n  migrations/003_invites.sql is not applied — stopping.");
  process.exit(1);
}
const cols = await qj("clinicians?select=email,can_invite,invited_by&order=created_at.asc");
console.log(`  clinicians.can_invite column      present`);
console.log(`  clinicians.invited_by column      present`);
console.log(`\n  can_invite by account:`);
for (const c of cols) {
  console.log(`    ${String(c.can_invite).padEnd(5)}  ${c.email}`);
}
console.log(`\n  founder can_invite=true:          ${cols.find((c) => c.email.toLowerCase() === FOUNDER)?.can_invite === true}`);
console.log(`  everyone else false:              ${cols.filter((c) => c.email.toLowerCase() !== FOUNDER).every((c) => c.can_invite === false)}`);

/* ── 2. admin creates a real invite ─────────────────────────────── */
hr("2. ADMIN CREATES AN INVITE (operator key)");
const created = await fetch(`${APP}/api/invites`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-ops-key": env.OPS_API_KEY },
  body: JSON.stringify({ email: INVITEE }),
});
console.log(`  POST /api/invites → HTTP ${created.status}`);
console.log(`  ${JSON.stringify(await created.json())}`);
const [invite] = await qj(`invites?invited_email=eq.${encodeURIComponent(INVITEE)}&select=*`);
console.log(`\n  row: status=${invite.status} single-use token=${invite.token.slice(0, 12)}… expires=${invite.expires_at?.slice(0, 10)}`);
console.log(`  emailed link: ${env.NEXT_PUBLIC_APP_URL}/join?token=${invite.token.slice(0, 12)}…`);

/* ── 3. that invitee registers via magic link ───────────────────── */
hr("3. INVITEE COMPLETES REGISTRATION (magic link)");
const before = (await qj(`clinicians?email=eq.${encodeURIComponent(INVITEE)}&select=id`)).length;
console.log(`  clinician rows before: ${before}`);
const ml = await (await fetch(`${APP}/api/auth/magic-link`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: INVITEE }),
})).json();
const mlToken = (ml.magicLink ?? "").split("token=")[1];
const verified = await fetch(`${APP}/api/auth/verify`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: mlToken, invite: invite.token }),
});
const vBody = await verified.json();
console.log(`  POST /api/auth/verify → HTTP ${verified.status}  ${JSON.stringify(vBody)}`);
console.log(`  session cookie set: ${/sessionToken=/.test(verified.headers.get("set-cookie") ?? "")}`);
const [newClinician] = await qj(`clinicians?email=eq.${encodeURIComponent(INVITEE)}&select=id,email,can_invite,invited_by`);
const [spent] = await qj(`invites?id=eq.${invite.id}&select=status,accepted_by`);
console.log(`\n  clinician created:   ${Boolean(newClinician)}`);
console.log(`  can_invite:          ${newClinician?.can_invite}  (must be false)`);
console.log(`  invited_by set:      ${newClinician?.invited_by ?? "null (invited by operator key)"}`);
console.log(`  invite status:       ${spent?.status}`);
console.log(`  accepted_by matches: ${spent?.accepted_by === newClinician?.id}`);

/* ── 4. the invite is single-use ───────────────────────────────── */
hr("4. THE INVITE IS SINGLE-USE");
const reuse = await fetch(`${APP}/api/invites/validate?token=${encodeURIComponent(invite.token)}`);
console.log(`  GET /api/invites/validate → ${JSON.stringify(await reuse.json())}`);

/* ── 5. uninvited address is refused ───────────────────────────── */
hr("5. UNINVITED ADDRESS IS REFUSED (same gate Google uses)");
const uBefore = (await qj(`clinicians?email=eq.${encodeURIComponent(UNINVITED)}&select=id`)).length;
const uml = await (await fetch(`${APP}/api/auth/magic-link`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: UNINVITED }),
})).json();
const uVerify = await fetch(`${APP}/api/auth/verify`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: (uml.magicLink ?? "").split("token=")[1] }),
});
console.log(`  POST /api/auth/verify → HTTP ${uVerify.status}`);
console.log(`  ${JSON.stringify(await uVerify.json())}`);
const uAfter = (await qj(`clinicians?email=eq.${encodeURIComponent(UNINVITED)}&select=id`)).length;
console.log(`\n  clinician rows ${uBefore} → ${uAfter}   NO account created: ${uAfter === 0}`);
console.log(`  session cookie set:  ${/sessionToken=/.test(uVerify.headers.get("set-cookie") ?? "")}  (must be false)`);

/* ── 6. a member without the permission cannot invite ──────────── */
hr("6. INVITE ENDPOINT REFUSES A MEMBER WITHOUT can_invite");
const token = await sessionFor(env, { clinicianId: newClinician.id, email: newClinician.email });
const refused = await fetch(`${APP}/api/invites`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: `sessionToken=${token}` },
  body: JSON.stringify({ email: `godwinyampoi449+x${stamp}@gmail.com` }),
});
console.log(`  as ${newClinician.email} (can_invite=false)`);
console.log(`  POST /api/invites → HTTP ${refused.status}  ${JSON.stringify(await refused.json())}`);

const anon = await fetch(`${APP}/api/invites`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "someone@hospital.org" }),
});
console.log(`  signed out          → HTTP ${anon.status}  ${JSON.stringify(await anon.json())}`);

hr("GOOGLE");
console.log("  Google sign-in runs the same signInOrReject gate as above.");
console.log("  Proving it end to end needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET");
console.log("  and a browser round trip — see the note in the summary.");
console.log(`  configured right now: ${Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}`);
