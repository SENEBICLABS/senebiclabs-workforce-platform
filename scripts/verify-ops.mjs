/**
 * Evidence for the operator console.
 *
 *   node scripts/verify-ops.mjs
 *
 * A clinician session is refused everywhere; the operator key is not. Then each
 * operator action is exercised against real rows and its effect checked from
 * the clinician side.
 */
import fs from "fs";
import { sessionFor } from "./session-for.mjs";
import { resolveSandbox } from "./sandbox.mjs";
import { signInLinkFor } from "./sign-in-link.mjs";
import { knownTokenFor } from "./invite.mjs";

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
const KEY = { "x-ops-key": env.OPS_API_KEY, "Content-Type": "application/json" };
const hr = (t) => console.log(`\n${"═".repeat(74)}\n${t}\n${"═".repeat(74)}`);

/* two throwaway clinicians */
const stamp = Date.now().toString().slice(-6);
const P = `godwinyampoi449+ops${stamp}@gmail.com`;   // the picked clinician
const O = `godwinyampoi449+oth${stamp}@gmail.com`;   // the other one
const ids = {};
for (const email of [P, O]) {
  const [c] = await (await q("clinicians", {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ email, name: email.split("+")[1].split("@")[0], access_code: Math.random().toString(36).slice(2, 10).toUpperCase(), active: true }),
  })).json();
  ids[email] = c.id;
}
const clinicianCookie = async (email) => {
  const t = await sessionFor(env, { clinicianId: ids[email], email });
  return `sessionToken=${t}`;
};
const asP = await clinicianCookie(P);
const asO = await clinicianCookie(O);

/* ── 1. the wall ────────────────────────────────────────────────── */
hr("1. A CLINICIAN SESSION IS REFUSED EVERYWHERE; THE KEY IS NOT");
const surface = [
  ["GET", "/ops"],
  ["GET", "/api/ops/overview"],
  ["GET", "/api/ops/clinicians"],
  ["GET", "/api/ops/pools"],
  ["GET", "/api/ops/invites"],
];
console.log("  path                        no auth   clinician session   operator key");
for (const [method, path] of surface) {
  const bare = await fetch(`${APP}${path}`, { method, redirect: "manual" });
  const clin = await fetch(`${APP}${path}`, { method, headers: { Cookie: asP }, redirect: "manual" });
  const oper = await fetch(`${APP}${path}`, { method, headers: KEY, redirect: "manual" });
  console.log(`  ${path.padEnd(28)} ${String(bare.status).padEnd(9)} ${String(clin.status).padEnd(19)} ${oper.status}`);
}
const mutations = [
  ["POST", `/api/ops/clinicians/${ids[P]}/can-invite`, { value: true }],
  ["POST", "/api/ops/invites", { email: "x@y.org" }],
];
console.log("\n  mutations with a clinician session:");
for (const [method, path, body] of mutations) {
  const r = await fetch(`${APP}${path}`, { method, headers: { Cookie: asP, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  console.log(`  ${method} ${path.padEnd(46)} → HTTP ${r.status}  ${JSON.stringify(await r.json())}`);
}
const badKey = await fetch(`${APP}/api/ops/overview`, { headers: { "x-ops-key": "wrong-key" } });
console.log(`\n  wrong operator key → HTTP ${badKey.status}`);

/* ── 2. can_invite ──────────────────────────────────────────────── */
hr("2. TOGGLING can_invite LIGHTS UP THAT CLINICIAN'S INVITE BUTTON");
const meBefore = await (await fetch(`${APP}/api/me`, { headers: { Cookie: asP } })).json();
const inviteBefore = await fetch(`${APP}/api/invites`, {
  method: "POST", headers: { Cookie: asP, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `godwinyampoi449+t1${stamp}@gmail.com` }),
});
console.log(`  before → /api/me can_invite=${meBefore.can_invite}   their POST /api/invites → HTTP ${inviteBefore.status}`);

await fetch(`${APP}/api/ops/clinicians/${ids[P]}/can-invite`, { method: "POST", headers: KEY, body: JSON.stringify({ value: true }) });
const meAfter = await (await fetch(`${APP}/api/me`, { headers: { Cookie: asP } })).json();
console.log(`  operator sets can_invite=true`);
console.log(`  after  → /api/me can_invite=${meAfter.can_invite}   (the invite panel renders from this)`);

await fetch(`${APP}/api/ops/clinicians/${ids[P]}/can-invite`, { method: "POST", headers: KEY, body: JSON.stringify({ value: false }) });
const meOff = await (await fetch(`${APP}/api/me`, { headers: { Cookie: asP } })).json();
const inviteOff = await fetch(`${APP}/api/invites`, {
  method: "POST", headers: { Cookie: asP, "Content-Type": "application/json" },
  body: JSON.stringify({ email: `godwinyampoi449+t2${stamp}@gmail.com` }),
});
console.log(`  revoked → can_invite=${meOff.can_invite}   their POST /api/invites → HTTP ${inviteOff.status}`);

/* ── 3. open / close / revoke-all ───────────────────────────────── */
hr("3. OPEN, CLOSE, AND CLOSE-AND-REVOKE-ALL");
const { pool } = await resolveSandbox("judge", env, qj);
const eligibleCount = async () =>
  (await qj(`pool_eligibility?pool_id=eq.${pool.id}&eligible=is.true&select=id`)).length;
const poolsSeenBy = async (cookie) =>
  (await (await fetch(`${APP}/api/pools`, { headers: { Cookie: cookie } })).json()).pools.map((p) => p.id);

await fetch(`${APP}/api/ops/pools/${pool.id}/revoke-all`, { method: "POST", headers: KEY });
console.log(`  starting clean: "${pool.name}" eligible=${await eligibleCount()}`);

const opened = await (await fetch(`${APP}/api/ops/pools/${pool.id}/open-access`, {
  method: "POST", headers: KEY, body: JSON.stringify({ value: true }) })).json();
console.log(`\n  OPEN  → ${opened.note}`);
// A sign-in is what tops a clinician up, so one is put through the gate. The
// link is signed the way lib/auth.ts signs it; /api/auth/verify still checks
// the signature, spends the jti and runs the gate.
await fetch(`${APP}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: await signInLinkFor(env, P) }) });
console.log(`  after ${P} signs in → they hold the pool: ${(await poolsSeenBy(asP)).includes(pool.id)}`);
console.log(`  eligible now: ${await eligibleCount()}`);

const closed = await (await fetch(`${APP}/api/ops/pools/${pool.id}/open-access`, {
  method: "POST", headers: KEY, body: JSON.stringify({ value: false }) })).json();
console.log(`\n  CLOSE → ${closed.note}`);
await fetch(`${APP}/api/auth/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: await signInLinkFor(env, O) }) });
console.log(`  a different clinician signs in → they get it: ${(await poolsSeenBy(asO)).includes(pool.id)}   (must be false)`);
console.log(`  the one who already had it keeps it: ${(await poolsSeenBy(asP)).includes(pool.id)}   (must be true)`);

const revoked = await (await fetch(`${APP}/api/ops/pools/${pool.id}/revoke-all`, { method: "POST", headers: KEY })).json();
console.log(`\n  CLOSE & REVOKE ALL → revoked ${revoked.revoked}, eligible now ${revoked.eligible_now}`);
console.log(`  they no longer see it: ${!(await poolsSeenBy(asP)).includes(pool.id)}`);

/* ── 4. manage access on a closed pool ──────────────────────────── */
hr("4. MANAGE ACCESS — ONLY THE PICKED CLINICIANS SEE A CLOSED POOL");
const set = await (await fetch(`${APP}/api/ops/pools/${pool.id}/eligibility`, {
  method: "POST", headers: KEY, body: JSON.stringify({ clinician_ids: [ids[P]] }) })).json();
console.log(`  assigned ${P} only → granted=${set.granted} revoked=${set.revoked} eligible_now=${set.eligible_now}`);
console.log(`  pool is still closed: ${(await qj(`pools?id=eq.${pool.id}&select=open_access`))[0].open_access === false}`);
console.log(`\n  picked clinician sees it in /api/pools:  ${(await poolsSeenBy(asP)).includes(pool.id)}`);
console.log(`  other clinician sees it in /api/pools:   ${(await poolsSeenBy(asO)).includes(pool.id)}   (must be false)`);
const direct = await fetch(`${APP}/api/pools/${pool.id}/next`, { headers: { Cookie: asO } });
console.log(`  other clinician asks for it directly → HTTP ${direct.status}  ${await direct.text()}`);

/* ── 5. invites ─────────────────────────────────────────────────── */
hr("5. SENDING AND REVOKING AN INVITE FROM THE CONSOLE");
const target = `godwinyampoi449+inv${stamp}@gmail.com`;
const sent = await fetch(`${APP}/api/ops/invites`, { method: "POST", headers: KEY, body: JSON.stringify({ email: target }) });
console.log(`  POST /api/ops/invites → HTTP ${sent.status}  ${JSON.stringify(await sent.json())}`);
const [row] = await qj(`invites?invited_email=eq.${encodeURIComponent(target)}&select=id,status,expires_at`);
// The console emails the link and stores only its hash, so the raw token is
// not readable back. Plant one whose hash we know, to accept it below.
const rawToken = await knownTokenFor(env, { q, qj }, target);
console.log(`  row: status=${row.status} expires=${row.expires_at?.slice(0, 10)}`);
const listed = await (await fetch(`${APP}/api/ops/invites`, { headers: KEY })).json();
console.log(`  appears in the pending list: ${listed.invites.some((i) => i.email === target)}  (invited_by "${listed.invites.find((i) => i.email === target)?.invited_by}")`);

const rev = await fetch(`${APP}/api/ops/invites/${row.id}/revoke`, { method: "POST", headers: KEY });
console.log(`\n  POST revoke → HTTP ${rev.status}  ${JSON.stringify(await rev.json())}`);
const validate = await (await fetch(`${APP}/api/invites/validate?token=${encodeURIComponent(rawToken)}`)).json();
console.log(`  the link now validates as: ${JSON.stringify(validate)}`);
const accept = await fetch(`${APP}/api/auth/verify`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: await signInLinkFor(env, target), invite: rawToken }),
});
console.log(`  attempting to accept it → HTTP ${accept.status}  ${JSON.stringify(await accept.json())}`);
console.log(`  no account created: ${(await qj(`clinicians?email=eq.${encodeURIComponent(target)}&select=id`)).length === 0}`);

/* ── cleanup ────────────────────────────────────────────────────── */
hr("CLEANUP");
await fetch(`${APP}/api/ops/pools/${pool.id}/revoke-all`, { method: "POST", headers: KEY });
await q(`invites?invited_email=like.*${stamp}*`, { method: "DELETE" });
for (const email of [P, O]) {
  for (const tbl of ["task_completions", "pool_eligibility", "sessions", "task_flags"]) {
    await q(`${tbl}?clinician_id=eq.${ids[email]}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${ids[email]}`, { method: "DELETE" });
}
console.log(`  test clinicians left: ${(await qj(`clinicians?email=like.*${stamp}*&select=id`)).length}`);
console.log(`  invites left:         ${(await qj(`invites?invited_email=like.*${stamp}*&select=id`)).length}`);
console.log(`  pool eligible now:    ${await eligibleCount()}`);
console.log(`  pool open_access:     ${(await qj(`pools?id=eq.${pool.id}&select=open_access`))[0].open_access}`);
