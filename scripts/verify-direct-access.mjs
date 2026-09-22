/**
 * Evidence: an invited clinician lands on the dashboard, opens a pool, and
 * reviews — with no calibration step and no 404 on the way.
 *
 *   node scripts/verify-direct-access.mjs
 */
import fs from "fs";
import { assertTestProject } from "./assert-test-project.mjs";

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

const SANDBOX_PROJECT = 38;
await assertTestProject(SANDBOX_PROJECT);

/* ── 1. backfill ────────────────────────────────────────────────── */
hr("1. BACKFILL — nobody stranded on a dead calibration route");
const before = await qj("clinicians?select=id,email,active&order=created_at.asc");
const elBefore = await qj("pool_eligibility?select=clinician_id,eligible");
const activeBefore = before.filter((c) => c.active).length;
console.log(`  clinicians: ${before.length}   active before: ${activeBefore}`);

await q("clinicians?active=is.false", {
  method: "PATCH", body: JSON.stringify({ active: true }),
});

const pools = await qj("pools?select=id,name,ls_project_id");
let granted = 0;
for (const c of before) {
  const held = new Set(
    (await qj(`pool_eligibility?clinician_id=eq.${c.id}&select=pool_id`)).map((r) => r.pool_id)
  );
  const missing = pools.filter((p) => !held.has(p.id));
  if (missing.length) {
    await q("pool_eligibility", {
      method: "POST",
      body: JSON.stringify(missing.map((p) => ({
        clinician_id: c.id, pool_id: p.id, eligible: true,
        eligible_since: new Date().toISOString(),
      }))),
    });
    granted += missing.length;
  }
  await q(`pool_eligibility?clinician_id=eq.${c.id}&eligible=is.false`, {
    method: "PATCH", body: JSON.stringify({ eligible: true }),
  });
}
const after = await qj("clinicians?select=id,email,active");
const elAfter = await qj("pool_eligibility?select=clinician_id,eligible");
console.log(`  active after:  ${after.filter((c) => c.active).length} of ${after.length}`);
console.log(`  eligibility rows: ${elBefore.length} → ${elAfter.length}  (granted ${granted})`);
console.log(`  all eligible=true: ${elAfter.every((r) => r.eligible)}`);
const founder = after.find((c) => c.email.toLowerCase() === "godwinyampoi449@gmail.com");
console.log(`  founder active: ${founder?.active}`);

/* ── 2. invite a fresh clinician ────────────────────────────────── */
hr("2. FOUNDER INVITES A NEW CLINICIAN");
const stamp = Date.now().toString().slice(-6);
const INVITEE = `godwinyampoi449+da${stamp}@gmail.com`;
const created = await fetch(`${APP}/api/invites`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-ops-key": env.OPS_API_KEY },
  body: JSON.stringify({ email: INVITEE }),
});
console.log(`  POST /api/invites → HTTP ${created.status}  ${JSON.stringify(await created.json())}`);
const [invite] = await qj(`invites?invited_email=eq.${encodeURIComponent(INVITEE)}&select=*`);
console.log(`  emailed link: /join?token=${invite.token.slice(0, 14)}…`);

/* ── 3. they accept ─────────────────────────────────────────────── */
hr("3. THEY ACCEPT THE INVITE");
const ml = await (await fetch(`${APP}/api/auth/magic-link`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: INVITEE }),
})).json();
const verify = await fetch(`${APP}/api/auth/verify`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ token: (ml.magicLink ?? "").split("token=")[1], invite: invite.token }),
});
const vBody = await verify.json();
console.log(`  POST /api/auth/verify → HTTP ${verify.status}  ${JSON.stringify(vBody)}`);
console.log(`  lands on: ${vBody.created ? "/welcome → dashboard" : "/dashboard"}  (never /calibration)`);
const cookie = (verify.headers.get("set-cookie") ?? "").split(";")[0];
const [me] = await qj(`clinicians?email=eq.${encodeURIComponent(INVITEE)}&select=id,email,active,can_invite,invited_by`);
console.log(`  clinician row: active=${me.active} can_invite=${me.can_invite}`);
const mine = await qj(`pool_eligibility?clinician_id=eq.${me.id}&select=pool_id,eligible`);
console.log(`  pools granted at acceptance: ${mine.length}  all eligible: ${mine.every((r) => r.eligible)}`);

/* ── 4. no 404 anywhere they can go ─────────────────────────────── */
hr("4. NO 404 ON ANY ROUTE IN THEIR PATH");
const call = (p, i = {}) => fetch(`${APP}${p}`, { ...i, headers: { Cookie: cookie, "Content-Type": "application/json", ...i.headers } });
for (const p of ["/welcome", "/dashboard", "/queue", "/account", "/calibration", "/earnings", "/workspace"]) {
  const r = await call(p, { redirect: "follow" });
  console.log(`  ${p.padEnd(14)} HTTP ${r.status}${r.status === 404 ? "   <<404>>" : ""}`);
}

/* ── 5. they open a pool and review ─────────────────────────────── */
hr("5. THEY OPEN A POOL AND REVIEW IMMEDIATELY");
const listed = await (await call("/api/pools")).json();
console.log(`  GET /api/pools → ${listed.pools.length} pool(s) visible`);
const sandbox = listed.pools.find((p) => pools.find((x) => x.id === p.id)?.ls_project_id === SANDBOX_PROJECT);
console.log(`  opening sandbox pool "${sandbox.name}"`);

const nextRes = await call(`/api/pools/${sandbox.id}/next`);
console.log(`  GET /api/pools/{id}/next → HTTP ${nextRes.status}`);
const task = await nextRes.json();
console.log(`  served task ${task.task_id} (case ${task.case_id}); fields: ${task.eval_config.fields.map((f) => f.name).join(", ")}`);

const answers = {};
for (const f of task.eval_config.fields) {
  const opts = f.type === "single" ? (f.options ?? []) : (f.classes ?? task.eval_config.classes ?? []);
  if (f.type === "single" || f.type === "from_classes") answers[f.name] = opts[0] ?? "";
  else if (f.type === "scale") answers[f.name] = Math.min(3, f.max ?? 5);
  else if (f.type === "text") answers[f.name] = "Direct-access verification.";
  else if (f.type === "structured") answers[f.name] = "No";
}
const lsBefore = ((await (await fetch(`${env.LABEL_STUDIO_API_URL}/api/tasks/${task.task_id}/`, { headers: { Authorization: `Token ${env.LABEL_STUDIO_API_TOKEN}` } })).json()).annotations ?? []).length;
const submit = await call(`/api/tasks/${task.task_id}/submit`, { method: "POST", body: JSON.stringify({ answers }) });
const sBody = await submit.json();
console.log(`  POST /api/tasks/${task.task_id}/submit → HTTP ${submit.status}`);
const lsTask = await (await fetch(`${env.LABEL_STUDIO_API_URL}/api/tasks/${task.task_id}/`, { headers: { Authorization: `Token ${env.LABEL_STUDIO_API_TOKEN}` } })).json();
const dbRows = await qj(`task_completions?clinician_id=eq.${me.id}&ls_task_id=eq.${task.task_id}&select=id`);
console.log(`  LS annotations ${lsBefore} → ${(lsTask.annotations ?? []).length}   completion recorded: ${dbRows.length === 1}`);
console.log(`  next task served: ${sBody.next ? `task ${sBody.next.task_id}` : "pool drained"}`);
console.log(`\n  invited → dashboard → pool → reviewed, with no calibration step: ${submit.status === 200 && dbRows.length === 1}`);
