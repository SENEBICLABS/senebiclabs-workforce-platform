/**
 * Evidence: reconcile does not false-alarm on a review pool.
 *
 *   node scripts/verify-review-reconcile.mjs
 *
 * Builds a state where completions genuinely exceed annotations — an approval,
 * a send-back, and a re-author — then shows reconcile reporting no divergence
 * because it measures Label Studio against approved items, not completions.
 */
import fs from "fs";
import { sessionFor } from "./session-for.mjs";
import { resolveSandbox } from "./sandbox.mjs";

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
const LSH = { Authorization: `Token ${env.LABEL_STUDIO_API_TOKEN}`, "Content-Type": "application/json" };
const LS = (p, i = {}) => fetch(`${env.LABEL_STUDIO_API_URL}${p}`, { headers: LSH, ...i });
const hr = (t) => console.log(`\n${"═".repeat(72)}\n${t}\n${"═".repeat(72)}`);

// Named in .env.local, checked for webhooks before a single write.
const { project: PROJECT, pool } = await resolveSandbox("author", env, qj);
if ((await q("review_items?select=id&limit=1")).status === 404) {
  console.log("migrations/006_review_items.sql is not applied — stopping.");
  process.exit(1);
}

const originalConfig = structuredClone(pool.eval_config);

/* ── setup ──────────────────────────────────────────────────────── */
hr("SETUP — a review pool and three clinicians");
const cfg = structuredClone(pool.eval_config);
cfg.review_required = true;
cfg.schema.field_order = ["draft_answer"];
cfg.schema.fields = {
  draft_answer: { type: "text", title: "Written answer", required: true },
};
await q(`pools?id=eq.${pool.id}`, { method: "PATCH", body: JSON.stringify({ eval_config: cfg }) });
console.log(`  pool "${pool.name}" → review_required=true`);

const stamp = Date.now().toString().slice(-6);
const A = `godwinyampoi449+a${stamp}@gmail.com`;
const B = `godwinyampoi449+b${stamp}@gmail.com`;
const C = `godwinyampoi449+c${stamp}@gmail.com`;
const ids = {};
for (const email of [A, B, C]) {
  const [c] = await (await q("clinicians", {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      email, name: email.split("+")[1].split("@")[0],
      access_code: Math.random().toString(36).slice(2, 10).toUpperCase(), active: true,
    }),
  })).json();
  ids[email] = c.id;
  await q("pool_eligibility", {
    method: "POST",
    body: JSON.stringify({ clinician_id: c.id, pool_id: pool.id, eligible: true, eligible_since: new Date().toISOString() }),
  });
}
const call = async (email) => {
  const t = await sessionFor(env, { clinicianId: ids[email], email });
  return (p, i = {}) => fetch(`${APP}${p}`, { ...i, headers: { Cookie: `sessionToken=${t}`, "Content-Type": "application/json", ...i.headers } });
};
const cA = await call(A), cB = await call(B), cC = await call(C);
console.log(`  A (author) B (reviewer) C (second author)`);

const nextFor = async (fn, wantPhase) => {
  for (let i = 0; i < 8; i++) {
    const r = await fn(`/api/pools/${pool.id}/next`);
    if (r.status === 204) return null;
    const t = await r.json();
    if (!wantPhase || t.phase === wantPhase) return t;
    await fn(`/api/tasks/${t.task_id}/flag`, { method: "POST", body: JSON.stringify({ reason: "seeking phase" }) });
  }
  return null;
};

/* ── build the state ────────────────────────────────────────────── */
hr("BUILD — one approved item, one sent back and re-authored");

const t1 = await nextFor(cA, "author");
await cA(`/api/tasks/${t1.task_id}/submit`, { method: "POST", body: JSON.stringify({ answers: { draft_answer: "First answer, written by A." } }) });
console.log(`  A authors task ${t1.task_id}                    → completion, no annotation`);

const r1 = await nextFor(cB, "review");
await cB(`/api/tasks/${r1.task_id}/review`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
console.log(`  B approves task ${r1.task_id}                   → completion + annotation`);

const t2 = await nextFor(cA, "author");
await cA(`/api/tasks/${t2.task_id}/submit`, { method: "POST", body: JSON.stringify({ answers: { draft_answer: "Second answer, too terse." } }) });
console.log(`  A authors task ${t2.task_id}                    → completion, no annotation`);

const r2 = await nextFor(cB, "review");
await cB(`/api/tasks/${r2.task_id}/review`, { method: "POST", body: JSON.stringify({ action: "reject", reason: "Too terse — say what to do next." }) });
console.log(`  B sends task ${r2.task_id} back                 → no annotation, revision +1`);

const t3 = await nextFor(cC, "author");
await cC(`/api/tasks/${t3.task_id}/submit`, { method: "POST", body: JSON.stringify({ answers: { draft_answer: "Second answer, rewritten by C with the next step spelled out." } }) });
console.log(`  C re-authors task ${t3.task_id}                 → completion, no annotation`);

const r3 = await nextFor(cB, "review");
await cB(`/api/tasks/${r3.task_id}/review`, { method: "POST", body: JSON.stringify({ action: "approve" }) });
console.log(`  B approves task ${r3.task_id}                   → completion + annotation`);

/* ── the raw numbers ────────────────────────────────────────────── */
hr("RAW COUNTS — completions deliberately exceed annotations");
async function allTasks(pid) {
  const out = [];
  for (let p = 1; p <= 50; p++) {
    const j = await (await LS(`/api/projects/${pid}/tasks/?page=${p}&page_size=200`)).json();
    const rows = Array.isArray(j) ? j : (j.tasks ?? []);
    out.push(...rows);
    if (rows.length < 200) break;
  }
  return out;
}
const tasks = await allTasks(PROJECT);
const lsCount = tasks.reduce((n, t) => n + (t.annotations?.length ?? 0), 0);
const comps = await qj(`task_completions?pool_id=eq.${pool.id}&select=clinician_id,ls_task_id`);
const items = await qj(`review_items?pool_id=eq.${pool.id}&select=ls_task_id,state,revision,ls_annotation_id`);
console.log(`  LS annotations:        ${lsCount}`);
console.log(`  task_completions:      ${comps.length}`);
console.log(`  approved review_items: ${items.filter((i) => i.state === "approved").length}`);
console.log(`\n  the old 1:1 check would have said diverged: ${lsCount !== comps.length}  (${lsCount} vs ${comps.length})`);

/* ── reconcile ──────────────────────────────────────────────────── */
hr("RECONCILE ON THE REVIEW POOL");
const rec = await fetch(`${APP}/api/tasks/reconcile?poolId=${pool.id}`, {
  headers: { "x-ops-key": env.OPS_API_KEY },
});
const body = await rec.json();
console.log(`  GET /api/tasks/reconcile?poolId=… → HTTP ${rec.status}\n`);
console.log(JSON.stringify(body, null, 2));
console.log(`\n  diverged: ${body.diverged}   (must be false)`);
console.log(`  orphans:  ${body.orphans_found}   (must be 0)`);
console.log(`  measured LS against: ${body.compared_against}`);

/* ── and it still catches a real orphan ─────────────────────────── */
hr("IT STILL CATCHES A REAL ORPHAN");
const stray = await (await LS(`/api/tasks/${t1.task_id}/annotations/`, {
  method: "POST",
  body: JSON.stringify({ result: [{ from_name: "draft_answer", to_name: "image", type: "textarea", value: { text: ["unapproved stray"] } }], was_cancelled: false }),
})).json();
console.log(`  wrote an unapproved annotation ${stray.id} straight into LS`);
const rec2 = await (await fetch(`${APP}/api/tasks/reconcile?poolId=${pool.id}`, { headers: { "x-ops-key": env.OPS_API_KEY } })).json();
console.log(`  reconcile → diverged=${rec2.diverged}  orphans_found=${rec2.orphans_found}`);
console.log(`  orphan identified: ${JSON.stringify(rec2.orphans?.[0])}`);
console.log(`  it is the stray, not an approved one: ${rec2.orphans?.[0]?.annotation_id === stray.id}`);

/* ── cleanup ────────────────────────────────────────────────────── */
hr("CLEANUP");
for (const t of await allTasks(PROJECT)) {
  for (const a of t.annotations ?? []) await LS(`/api/annotations/${a.id}/`, { method: "DELETE" });
}
await q(`review_items?pool_id=eq.${pool.id}`, { method: "DELETE" });
for (const email of [A, B, C]) {
  for (const tbl of ["task_completions", "pool_eligibility", "sessions", "task_flags"]) {
    await q(`${tbl}?clinician_id=eq.${ids[email]}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${ids[email]}`, { method: "DELETE" });
}
await q(`pools?id=eq.${pool.id}`, { method: "PATCH", body: JSON.stringify({ eval_config: originalConfig }) });
const endTasks = await allTasks(PROJECT);
console.log(`  sandbox annotations left: ${endTasks.reduce((n, t) => n + (t.annotations?.length ?? 0), 0)}`);
console.log(`  test clinicians left: ${(await qj(`clinicians?email=like.*+${stamp}*&select=id`)).length}`);
console.log(`  pool config restored: ${JSON.stringify((await qj(`pools?id=eq.${pool.id}&select=eval_config`))[0].eval_config) === JSON.stringify(originalConfig)}`);
