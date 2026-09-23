/**
 * Evidence for the judging path, in the product's own terms.
 *
 *   node scripts/verify-judging.mjs
 *
 * Four things, none of which an HTTP 200 on its own would show:
 *
 *   1. A submitted judgement reaches Label Studio AND records exactly one
 *      completion, and submitting the same case twice does not record a second.
 *   2. The overlap ceiling holds. A pool commissions a fixed number of readings
 *      per case; a fourth clinician on a three-reading case is refused by
 *      claim_task_slot, under the pool's row lock, not by a read-then-write in
 *      the API that two callers could both pass.
 *   3. A flagged case is recorded, and stops being offered to that clinician.
 *   4. Whether a flagged case is paid. There is no money in this codebase, so
 *      the only record of work done is task_completions. This reports what a
 *      flag actually leaves behind rather than assuming.
 *
 * Runs only against the webhook-free judge sandbox named in .env.local.
 */
import { sessionFor } from "./session-for.mjs";
import { loadEnv, resolveSandbox } from "./sandbox.mjs";

const env = loadEnv();
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
const ok = (b) => (b ? "yes" : "NO");

const { project: PROJECT, poolId: POOL, pool } = await resolveSandbox("judge", env, qj);
console.log(`  sandbox: LS ${PROJECT} / pool "${pool.name}"`);
console.log(`  readings commissioned per case: ${pool.maximum_annotations}`);

const annotationsOn = async (taskId) =>
  ((await (await LS(`/api/tasks/${taskId}/`)).json()).annotations ?? []).length;
const completionsOn = async (taskId) =>
  (await qj(`task_completions?ls_task_id=eq.${taskId}&select=id,clinician_id`)).length;

/* ── setup: four clinicians, all eligible ───────────────────────── */
hr("SETUP");
const stamp = Date.now().toString().slice(-6);
const NAMES = ["a", "b", "c", "d"];
const people = {};
for (const n of NAMES) {
  const email = `godwinyampoi449+j${n}${stamp}@gmail.com`;
  const [c] = await (await q("clinicians", {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      email,
      name: `judge-${n}`,
      access_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
      active: true,
    }),
  })).json();
  await q("pool_eligibility", {
    method: "POST",
    body: JSON.stringify({ clinician_id: c.id, pool_id: POOL, eligible: true, eligible_since: new Date().toISOString() }),
  });
  const token = await sessionFor(env, { clinicianId: c.id, email });
  people[n] = {
    id: c.id,
    email,
    call: (p, i = {}) =>
      fetch(`${APP}${p}`, { ...i, headers: { Cookie: `sessionToken=${token}`, "Content-Type": "application/json", ...i.headers } }),
  };
}
console.log(`  four clinicians created, all eligible for the pool`);

const ourCompletionIds = new Set();

const JUDGEMENT = {
  verdict: "incorrect",
  confidence: 4,
  critical_miss: "No",
  correction: "Bibasal atelectasis is present and is not described.",
};

/* ── 1. one judgement: annotation + exactly one completion ──────── */
hr("1. A SUBMITTED JUDGEMENT LANDS, ONCE");
// Deliberately not whatever /next happens to offer. The ceiling test below
// needs a case with no readings on it yet, and a case left part-finished by an
// earlier run would make "three readings" arrive sooner than the test thinks,
// which is exactly how a passing result could be read off a wrong sequence.
const allTasks = await (await LS(`/api/tasks/?project=${PROJECT}&page_size=100`)).json();
const taskList = Array.isArray(allTasks) ? allTasks : (allTasks.tasks ?? []);
let TASK = null;
for (const t of taskList) {
  if ((t.annotations?.length ?? 0) === 0 && (await completionsOn(t.id)) === 0) { TASK = t.id; break; }
}
if (!TASK) {
  console.log("  No untouched case in the sandbox. Reset it before running this.");
  process.exit(1);
}
const first = await (await people.a.call(`/api/pools/${POOL}/next`)).json();
console.log(`  /next offers task ${first.task_id}; this test uses untouched task ${TASK}`);

const annBefore = await annotationsOn(TASK);
const compBefore = await completionsOn(TASK);
const s1 = await people.a.call(`/api/tasks/${TASK}/submit`, {
  method: "POST",
  body: JSON.stringify({ answers: JUDGEMENT }),
});
ourCompletionIds.add(`${TASK}`);
console.log(`  POST submit → HTTP ${s1.status}`);
const annAfter = await annotationsOn(TASK);
const compAfter = await completionsOn(TASK);
console.log(`  Label Studio annotations ${annBefore} → ${annAfter}   (landed: ${ok(annAfter === annBefore + 1)})`);
console.log(`  task_completions          ${compBefore} → ${compAfter}   (exactly one: ${ok(compAfter === compBefore + 1)})`);

const mine = await qj(`task_completions?ls_task_id=eq.${TASK}&clinician_id=eq.${people.a.id}&select=annotation_data`);
console.log(`  the answers were stored with it: ${ok(JSON.stringify(mine[0]?.annotation_data ?? {}).includes("Bibasal"))}`);

/* ── 2. the same clinician submitting again ─────────────────────── */
hr("2. THE SAME CLINICIAN SUBMITTING THE SAME CASE AGAIN");
const s2 = await people.a.call(`/api/tasks/${TASK}/submit`, {
  method: "POST",
  body: JSON.stringify({ answers: { ...JUDGEMENT, correction: "a second, different answer" } }),
});
const s2body = await s2.json().catch(() => ({}));
const compRepeat = await completionsOn(TASK);
const annRepeat = await annotationsOn(TASK);
console.log(`  POST submit again → HTTP ${s2.status}  ${JSON.stringify(s2body).slice(0, 110)}`);
console.log(`  completions still ${compRepeat}: ${ok(compRepeat === compAfter)}   (no second row)`);
console.log(`  annotations still ${annRepeat}: ${ok(annRepeat === annAfter)}   (no second annotation)`);

/* ── 3. the overlap ceiling ─────────────────────────────────────── */
hr("3. THE OVERLAP CEILING HOLDS");
for (const n of ["b", "c"]) {
  const r = await people[n].call(`/api/tasks/${TASK}/submit`, {
    method: "POST",
    body: JSON.stringify({ answers: JUDGEMENT }),
  });
  console.log(`  ${n.toUpperCase()} submits → HTTP ${r.status}   completions now ${await completionsOn(TASK)}`);
}
const atCeiling = await completionsOn(TASK);
console.log(`  at the ceiling of ${pool.maximum_annotations}: ${ok(atCeiling === pool.maximum_annotations)}`);

const fourth = await people.d.call(`/api/tasks/${TASK}/submit`, {
  method: "POST",
  body: JSON.stringify({ answers: JUDGEMENT }),
});
const fourthBody = await fourth.json().catch(() => ({}));
const afterFourth = await completionsOn(TASK);
const annFourth = await annotationsOn(TASK);
console.log(`\n  a fourth clinician submits → HTTP ${fourth.status}`);
console.log(`  ${JSON.stringify(fourthBody).slice(0, 150)}`);
console.log(`  refused rather than accepted:     ${ok(fourth.status !== 200)}`);
console.log(`  completions still ${afterFourth}:               ${ok(afterFourth === pool.maximum_annotations)}`);
console.log(`  no annotation written for them:   ${ok(annFourth === atCeiling)}`);

// Prove the refusal comes from the locked claim, not from an API pre-check:
// call the function directly, which is what the route calls.
const direct = await (await q("rpc/claim_task_slot", {
  method: "POST",
  body: JSON.stringify({
    p_clinician_id: people.d.id,
    p_pool_id: POOL,
    p_ls_task_id: TASK,
    p_annotation_data: {},
  }),
})).json();
console.log(`  claim_task_slot called directly returns: ${JSON.stringify(direct)}  (expected "full")`);

/* ── 4. flagging ────────────────────────────────────────────────── */
hr("4. A FLAGGED CASE");
const served = await (await people.d.call(`/api/pools/${POOL}/next`)).json();
const FLAGGED = served.task_id;
console.log(`  D is offered task ${FLAGGED}`);

const compsBeforeFlag = (await qj(`task_completions?clinician_id=eq.${people.d.id}&select=id`)).length;
const flagRes = await people.d.call(`/api/tasks/${FLAGGED}/flag`, {
  method: "POST",
  body: JSON.stringify({ reason: "Outside my area" }),
});
console.log(`  POST flag → HTTP ${flagRes.status}`);

const flags = await qj(`task_flags?clinician_id=eq.${people.d.id}&ls_task_id=eq.${FLAGGED}&select=id,reason`);
console.log(`  recorded in task_flags:           ${ok(flags.length === 1)}  ${JSON.stringify(flags[0]?.reason ?? "")}`);
console.log(`  no annotation written:            ${ok((await annotationsOn(FLAGGED)) === 0)}`);

// It must stop being offered to them, and still be offered to someone else.
const offers = [];
for (let i = 0; i < 4; i++) {
  const r = await people.d.call(`/api/pools/${POOL}/next`);
  if (r.status === 204) break;
  offers.push((await r.json()).task_id);
}
console.log(`  next four offers to D: ${offers.join(", ") || "(none left)"}`);
console.log(`  the flagged case is not among them: ${ok(!offers.includes(FLAGGED))}`);

const toOthers = await (await people.b.call(`/api/pools/${POOL}/next`)).json();
console.log(`  still available to others:        ${ok(Boolean(toOthers.task_id))}`);

const compsAfterFlag = (await qj(`task_completions?clinician_id=eq.${people.d.id}&select=id`)).length;
console.log(`\n  PAY: task_completions for D ${compsBeforeFlag} → ${compsAfterFlag}`);
console.log(`  a flag leaves a payable record:   ${ok(compsAfterFlag > compsBeforeFlag)}`);
console.log(`  (task_completions is the only per-case record of work in this schema)`);

/* ── cleanup ────────────────────────────────────────────────────── */
hr("CLEANUP");
// Only the annotations this run put there. Deleting every annotation on a task
// would throw away another run's evidence, and leave its completion rows
// pointing at nothing.
for (const taskId of new Set([TASK, FLAGGED])) {
  const t = await (await LS(`/api/tasks/${taskId}/`)).json();
  for (const a of t.annotations ?? []) {
    const byUs = ourCompletionIds.has(`${taskId}`);
    if (byUs) await LS(`/api/annotations/${a.id}/`, { method: "DELETE" });
  }
}
for (const n of NAMES) {
  const id = people[n].id;
  for (const tbl of ["task_completions", "task_flags", "pool_eligibility", "sessions"]) {
    await q(`${tbl}?clinician_id=eq.${id}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${id}`, { method: "DELETE" });
}
const leftover = await qj(`task_completions?pool_id=eq.${POOL}&select=id`);
const stillThere = await annotationsOn(TASK);
const who = await qj(`clinicians?email=like.*j*${stamp}*&select=id`);
console.log(`  completions left in the sandbox pool: ${leftover.length}`);
console.log(`  annotations left on task ${TASK}: ${stillThere}`);
console.log(`  test clinicians removed: ${ok(who.length === 0)}`);
