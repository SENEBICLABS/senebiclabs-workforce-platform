/**
 * Evidence that a senior's decision is recorded once, and only once.
 *
 *   node scripts/verify-adjudication-pass.mjs
 *
 * A held case is offered to every senior in the pool until one settles it, and
 * the held list is cached for a few seconds, so two seniors opening the same
 * disagreement at the same moment is ordinary rather than unlucky. Exactly one
 * of them must end up recorded, and the other must be told before anything is
 * sent to HEALTH — a case decided twice would be two different final answers
 * for one case, with no way to say which was the answer.
 *
 * The guard is a unique index on the case, and this exercises it directly: no
 * HEALTH, a pool invented for the purpose and task ids that exist nowhere.
 */
import { loadEnv } from "./env.mjs";

const env = loadEnv();
const SB = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
const q = (p, i = {}) => fetch(`${SB}/${p}`, { headers: H, ...i });
const qj = (p, i = {}) => q(p, i).then((r) => r.json());
const hr = (t) => console.log(`\n${"═".repeat(72)}\n${t}\n${"═".repeat(72)}`);

let failures = 0;
const check = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

// The kind has to be a kind the table will accept before any of this means
// anything. Reading the table proves nothing: the constraint only shows itself
// on a write, so the precondition is a write that is immediately undone.
const probeId = 889999;
const probeWrite = await q("task_completions", {
  method: "POST",
  body: JSON.stringify({
    clinician_id: "00000000-0000-0000-0000-000000000000",
    pool_id: "00000000-0000-0000-0000-000000000000",
    ls_task_id: probeId,
    kind: "adjudication",
  }),
});
if (probeWrite.status === 400) {
  const why = await probeWrite.json().catch(() => ({}));
  if (String(why?.code) === "23514") {
    console.log("migrations/019_adjudication_pass.sql is not applied — the kind");
    console.log("constraint still refuses 'adjudication'. Stopping.");
    process.exit(1);
  }
}
await q(`task_completions?ls_task_id=eq.${probeId}`, { method: "DELETE" });

const stamp = Date.now().toString().slice(-6);

hr("SETUP");
const [pool] = await (await q("pools", {
  method: "POST",
  headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify({
    name: `TEMP — adjudication pass ${stamp}`,
    ls_project_id: 0,                    // required by the table, unused
    open_access: false,
    maximum_annotations: 2,
    calibration_items: 0,
    eval_config: {},
  }),
})).json();

const people = {};
const NAMES = ["reader1", "reader2", "senior1", "senior2", "senior3", "senior4"];
for (const n of NAMES) {
  const [row] = await (await q("clinicians", {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      email: `godwinyampoi449+adp${n}${stamp}@gmail.com`,
      name: `adp-${n}`,
      access_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
      active: true,
    }),
  })).json();
  people[n] = row.id;
}
console.log(`  pool "${pool.name}" and ${NAMES.length} clinicians`);

const CASE = 890001;
const write = (who, kind, task = CASE) =>
  q("task_completions", {
    method: "POST",
    body: JSON.stringify({
      clinician_id: people[who],
      pool_id: pool.id,
      ls_task_id: task,
      kind,
      annotation_data: { by: who },
    }),
  });

const rowsOn = (task, kind) =>
  qj(`task_completions?ls_task_id=eq.${task}${kind ? `&kind=eq.${kind}` : ""}&select=clinician_id,kind`);

/* ── 1 ───────────────────────────────────────────────────────────── */
hr("1. THE NEW KIND IS ACCEPTED, ALONGSIDE THE READINGS IT SETTLES");
console.log(`  two readings → ${(await write("reader1", "judgement")).status}, ${(await write("reader2", "judgement")).status}`);
const first = await write("senior1", "adjudication");
check("a senior's decision is recorded", first.status === 201, `(HTTP ${first.status})`);
const all = await rowsOn(CASE);
check("it sits alongside both readings", all.length === 3, `(${all.length} rows)`);
check("and is its own kind", all.filter((r) => r.kind === "adjudication").length === 1);

/* ── 2 ───────────────────────────────────────────────────────────── */
hr("2. A SECOND SENIOR CANNOT DECIDE THE SAME CASE");
const second = await write("senior2", "adjudication");
const body = await second.json().catch(() => ({}));
check("refused", second.status === 409, `(HTTP ${second.status})`);
check("by the one-adjudication index", String(body?.code ?? "") === "23505", `(${body?.code})`);
check("still one decision", (await rowsOn(CASE, "adjudication")).length === 1);

/* ── 3 ───────────────────────────────────────────────────────────── */
hr("3. NOR CAN THE SAME SENIOR DECIDE IT TWICE");
const again = await write("senior1", "adjudication");
check("refused", again.status === 409, `(HTTP ${again.status})`);
check("still one decision", (await rowsOn(CASE, "adjudication")).length === 1);

/* ── 4 ───────────────────────────────────────────────────────────── */
hr("4. FOUR SENIORS AT THE SAME INSTANT PRODUCE ONE DECISION");
const RACE = 890002;
await write("reader1", "judgement", RACE);
await write("reader2", "judgement", RACE);
const contenders = ["senior1", "senior2", "senior3", "senior4"];
const outcomes = await Promise.all(
  contenders.map((n) => write(n, "adjudication", RACE).then((r) => r.status))
);
console.log(`  four at once → ${JSON.stringify(outcomes)}`);
check("exactly one was recorded", outcomes.filter((s) => s === 201).length === 1);
check("the rest were refused", outcomes.filter((s) => s === 409).length === 3);
check("the case has one decision", (await rowsOn(RACE, "adjudication")).length === 1);

/* ── 5 ───────────────────────────────────────────────────────────── */
hr("5. A DECISION ON ONE CASE DOES NOT BLOCK ANOTHER");
const OTHER = 890003;
const elsewhere = await write("senior1", "adjudication", OTHER);
check("the same senior can settle a different case", elsewhere.status === 201, `(HTTP ${elsewhere.status})`);
check("each case has its own single decision",
  (await rowsOn(OTHER, "adjudication")).length === 1 && (await rowsOn(CASE, "adjudication")).length === 1);

/* ── cleanup ─────────────────────────────────────────────────────── */
hr("CLEANUP");
for (const id of Object.values(people)) {
  for (const tbl of ["task_completions", "task_flags", "pool_eligibility", "sessions"]) {
    await q(`${tbl}?clinician_id=eq.${id}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${id}`, { method: "DELETE" });
}
await q(`pools?id=eq.${pool.id}`, { method: "DELETE" });
const left = await qj("pools?select=name&order=name");
console.log(`  probe pool removed: ${!left.some((p) => p.name.includes(stamp))}`);
console.log(`  pools remaining: ${left.map((p) => p.name.slice(0, 34)).join(" | ") || "(none)"}`);

console.log(failures === 0 ? "\n  ALL CHECKS PASSED" : `\n  ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
