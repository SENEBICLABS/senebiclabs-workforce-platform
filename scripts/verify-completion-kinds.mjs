/**
 * Evidence that every paid pass is recorded, and that recording flags did not
 * break the two things it could easily have broken.
 *
 *   node scripts/verify-completion-kinds.mjs
 *
 * Five things:
 *
 *   1. Flagging writes exactly one row, of kind 'flag'.
 *   2. A flagged case still reaches its full complement of reviewers. Flag rows
 *      must not consume judgement slots, or three clinicians flagging a hard
 *      case would fill it and nobody would ever judge it.
 *   3. A clinician who flags a case can still be recorded for a different pass
 *      on that same case. Under the old unique index this was impossible, and
 *      silently so.
 *   4. The ceiling still refuses a fourth judgement.
 *   5. The work record shows a clinician their own rows and nobody else's.
 *
 * These are all facts about Postgres: a unique index, a row-locked function, a
 * check constraint. A fake would only prove the fake agrees with itself, so
 * this runs against the real database, in the webhook-free sandbox.
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
const LS = (p, i = {}) =>
  fetch(`${env.LABEL_STUDIO_API_URL}${p}`, {
    headers: { Authorization: `Token ${env.LABEL_STUDIO_API_TOKEN}`, "Content-Type": "application/json" },
    ...i,
  });
const hr = (t) => console.log(`\n${"═".repeat(72)}\n${t}\n${"═".repeat(72)}`);

let failures = 0;
const check = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

const { project: PROJECT, poolId: POOL, pool } = await resolveSandbox("judge", env, qj);

// The column has to exist before any of this means anything.
if ((await q("task_completions?select=kind&limit=1")).status !== 200) {
  console.log("migrations/016_completion_kind.sql is not applied — stopping.");
  process.exit(1);
}

const rowsFor = (taskId, extra = "") =>
  qj(`task_completions?ls_task_id=eq.${taskId}&select=kind,clinician_id${extra}`);
const judgementsOn = async (taskId) =>
  (await qj(`task_completions?ls_task_id=eq.${taskId}&kind=eq.judgement&select=id`)).length;

/* ── setup ──────────────────────────────────────────────────────── */
hr("SETUP");
console.log(`  sandbox: LS ${PROJECT} / "${pool.name}", ${pool.maximum_annotations} readings per case`);

const stamp = Date.now().toString().slice(-6);
const NAMES = ["a", "b", "c", "d", "e"];
const people = {};
for (const n of NAMES) {
  const email = `godwinyampoi449+k${n}${stamp}@gmail.com`;
  const [c] = await (await q("clinicians", {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      email, name: `kind-${n}`,
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
    id: c.id, email, token,
    call: (p, i = {}) =>
      fetch(`${APP}${p}`, { ...i, headers: { Cookie: `sessionToken=${token}`, "Content-Type": "application/json", ...i.headers } }),
  };
}
console.log(`  five clinicians, all eligible`);

// Two untouched cases: one to flag, one to fill.
const listing = await (await LS(`/api/tasks/?project=${PROJECT}&page_size=100`)).json();
const tasks = Array.isArray(listing) ? listing : (listing.tasks ?? []);
const untouched = [];
for (const t of tasks) {
  if ((t.annotations?.length ?? 0) === 0 && (await judgementsOn(t.id)) === 0 && (await rowsFor(t.id)).length === 0) {
    untouched.push(t.id);
  }
  if (untouched.length === 2) break;
}
if (untouched.length < 2) {
  console.log("  Need two untouched cases in the sandbox. Reset it and run again.");
  process.exit(1);
}
const [FLAGGED, CEILING] = untouched;
console.log(`  case to flag: ${FLAGGED}   case to fill: ${CEILING}`);

const JUDGEMENT = { verdict: "correct", confidence: 3, critical_miss: "No", correction: "" };

/* ── 1. a flag writes exactly one row, of kind flag ─────────────── */
hr("1. FLAGGING WRITES EXACTLY ONE ROW, OF KIND 'flag'");
const flagRes = await people.a.call(`/api/tasks/${FLAGGED}/flag`, {
  method: "POST", body: JSON.stringify({ reason: "Outside my area" }),
});
const aRows = await qj(`task_completions?ls_task_id=eq.${FLAGGED}&clinician_id=eq.${people.a.id}&select=kind,annotation_data`);
console.log(`  POST flag → HTTP ${flagRes.status}`);
check("exactly one row recorded", aRows.length === 1, `(${aRows.length})`);
check("its kind is 'flag'", aRows[0]?.kind === "flag", `(${aRows[0]?.kind})`);
check("the reason is kept with it", JSON.stringify(aRows[0]?.annotation_data ?? {}).includes("Outside my area"));

// Flagging twice must not write a second row.
await people.a.call(`/api/tasks/${FLAGGED}/flag`, { method: "POST", body: JSON.stringify({ reason: "again" }) });
const afterTwice = await qj(`task_completions?ls_task_id=eq.${FLAGGED}&clinician_id=eq.${people.a.id}&select=id`);
check("flagging the same case twice still leaves one row", afterTwice.length === 1, `(${afterTwice.length})`);

/* ── 2. a flagged case still reaches its full complement ────────── */
hr("2. A FLAGGED CASE STILL REACHES ITS FULL COMPLEMENT OF REVIEWERS");
console.log(`  case ${FLAGGED} carries A's flag; B, C and D now judge it`);
for (const n of ["b", "c", "d"]) {
  const r = await people[n].call(`/api/tasks/${FLAGGED}/submit`, {
    method: "POST", body: JSON.stringify({ answers: JUDGEMENT }),
  });
  console.log(`     ${n.toUpperCase()} → HTTP ${r.status}   judgements now ${await judgementsOn(FLAGGED)}`);
}
const judged = await judgementsOn(FLAGGED);
check(`all ${pool.maximum_annotations} readings were taken despite the flag`, judged === pool.maximum_annotations, `(${judged})`);
const anns = ((await (await LS(`/api/tasks/${FLAGGED}/`)).json()).annotations ?? []).length;
check("and each produced an annotation", anns === pool.maximum_annotations, `(${anns})`);
const allRows = await rowsFor(FLAGGED);
check("the flag row is still there alongside them", allRows.filter((r) => r.kind === "flag").length === 1);
check("four rows in total, one flag and three judgements", allRows.length === pool.maximum_annotations + 1, `(${allRows.length})`);

/* ── 3. a flagger can still be recorded for another pass ────────── */
hr("3. A CLINICIAN WHO FLAGS A CASE CAN STILL BE RECORDED ON ANOTHER PASS FOR IT");
// E flags a case, then judges the same case. Under the old index the second
// row could not exist, and the clinician would have worked for nothing.
await people.e.call(`/api/tasks/${CEILING}/flag`, { method: "POST", body: JSON.stringify({ reason: "on reflection, mine after all" }) });
const eFlag = await qj(`task_completions?ls_task_id=eq.${CEILING}&clinician_id=eq.${people.e.id}&select=kind`);
check("E's flag is recorded", eFlag.length === 1 && eFlag[0].kind === "flag");

const eJudge = await people.e.call(`/api/tasks/${CEILING}/submit`, {
  method: "POST", body: JSON.stringify({ answers: JUDGEMENT }),
});
const eRows = await qj(`task_completions?ls_task_id=eq.${CEILING}&clinician_id=eq.${people.e.id}&select=kind&order=kind`);
console.log(`  E judges the case they flagged → HTTP ${eJudge.status}`);
check("both passes are recorded for E", eRows.length === 2, `(${eRows.length}: ${eRows.map((r) => r.kind).join(", ")})`);
check("one flag and one judgement", eRows.some((r) => r.kind === "flag") && eRows.some((r) => r.kind === "judgement"));

/* ── 4. the ceiling still refuses a fourth judgement ────────────── */
hr("4. THE CEILING STILL REFUSES A FOURTH JUDGEMENT");
for (const n of ["a", "b"]) {
  const r = await people[n].call(`/api/tasks/${CEILING}/submit`, { method: "POST", body: JSON.stringify({ answers: JUDGEMENT }) });
  console.log(`  ${n.toUpperCase()} judges → HTTP ${r.status}   judgements now ${await judgementsOn(CEILING)}`);
}
const atCeiling = await judgementsOn(CEILING);
check(`the case is at its ceiling of ${pool.maximum_annotations}`, atCeiling === pool.maximum_annotations, `(${atCeiling})`);

const fourth = await people.c.call(`/api/tasks/${CEILING}/submit`, { method: "POST", body: JSON.stringify({ answers: JUDGEMENT }) });
const fourthBody = await fourth.json().catch(() => ({}));
console.log(`  a fourth clinician judges → HTTP ${fourth.status}  ${JSON.stringify(fourthBody).slice(0, 90)}`);
check("refused", fourth.status !== 200);
check("no fourth judgement recorded", (await judgementsOn(CEILING)) === pool.maximum_annotations);

const direct = await (await q("rpc/claim_task_slot", {
  method: "POST",
  body: JSON.stringify({ p_clinician_id: people.c.id, p_pool_id: POOL, p_ls_task_id: CEILING, p_annotation_data: {} }),
})).json();
check('claim_task_slot itself says "full"', direct === "full", `(${JSON.stringify(direct)})`);

/* ── 5. the work record is the clinician's own ──────────────────── */
hr("5. THE WORK RECORD SHOWS ONLY THAT CLINICIAN'S OWN PASSES");
const mine = await (await people.e.call("/api/me/passes")).json();
const eActual = await qj(`task_completions?clinician_id=eq.${people.e.id}&select=id`);
console.log(`  GET /api/me/passes as E → total ${mine.total}, by kind ${JSON.stringify(mine.by_kind)}`);
check("total matches E's own rows", mine.total === eActual.length, `(${mine.total} vs ${eActual.length})`);
check("E sees their flag", mine.by_kind?.flag === 1, `(${mine.by_kind?.flag})`);
check("E sees their judgement", mine.by_kind?.judgement === 1, `(${mine.by_kind?.judgement})`);

const everyone = await qj("task_completions?select=id");
check("E is not shown the whole table", mine.total < everyone.length, `(${mine.total} of ${everyone.length})`);

const otherPools = mine.by_pool.filter((p) => p.pool_id !== POOL);
check("no pool they did not work in", otherPools.length === 0);
const aRecord = await (await people.a.call("/api/me/passes")).json();
check("a different clinician gets a different record", aRecord.total !== mine.total || JSON.stringify(aRecord.by_kind) !== JSON.stringify(mine.by_kind));
console.log(`  GET as A → total ${aRecord.total}, by kind ${JSON.stringify(aRecord.by_kind)}`);

/* ── cleanup ────────────────────────────────────────────────────── */
hr("CLEANUP");
for (const taskId of [FLAGGED, CEILING]) {
  const t = await (await LS(`/api/tasks/${taskId}/`)).json();
  for (const a of t.annotations ?? []) await LS(`/api/annotations/${a.id}/`, { method: "DELETE" });
}
for (const n of NAMES) {
  const id = people[n].id;
  for (const tbl of ["task_completions", "task_flags", "pool_eligibility", "sessions"]) {
    await q(`${tbl}?clinician_id=eq.${id}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${id}`, { method: "DELETE" });
}
const left = await qj(`task_completions?pool_id=eq.${POOL}&select=id`);
console.log(`  completions left in the sandbox pool: ${left.length}`);

console.log(failures === 0 ? "\n  ALL CHECKS PASSED" : `\n  ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
