/**
 * Evidence for the senior review queue, against a stand-in for HEALTH.
 *
 *   node scripts/stub-health.mjs &                  # on 3457
 *   HEALTH_API_BASE=http://localhost:3457/api/v1/project \
 *   HEALTH_ADMIN_KEY=stub-key HEALTH_KEY_HEADER=X-Admin-Key \
 *     npx next start -p 3000 &
 *   node scripts/verify-senior-queue.mjs
 *
 * What is being tested is this platform's behaviour, not HEALTH's, so a stub is
 * the right counterparty: the whole path runs — the queue, the gate, what a
 * senior is shown, what goes back — without a credential for the real service
 * and without settling a real client's case.
 *
 * Nothing reaches Label Studio. A senior's decision deliberately never writes
 * an annotation, so this runs against the live project's tasks: it reads them
 * to render the case and writes nothing back.
 *
 * What it proves:
 *
 *   1. A senior who already read the case is not offered it, even when their
 *      reading was recorded under a different pool over the same project.
 *   2. A clinician who is not senior is never offered a held case.
 *   3. A senior is offered it ahead of unclaimed work, and cannot tell: the
 *      payload is an ordinary case, carrying none of the earlier readings.
 *   4. Agreeing with an earlier reading is recorded as a majority.
 *   5. Agreeing with neither is recorded as the senior's answer standing.
 *   6. The pass is recorded once, and nothing reaches Label Studio.
 */
import { sessionFor } from "./session-for.mjs";
import { loadEnv } from "./sandbox.mjs";

const env = loadEnv();
const APP = "http://localhost:3000";
const STUB = process.env.STUB_URL || "http://localhost:3457";
const SB = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1`;
const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};
const q = (p, i = {}) => fetch(`${SB}/${p}`, { headers: H, ...i });
const qj = (p, i = {}) => q(p, i).then((r) => r.json());
const LS = (p) =>
  fetch(`${env.LABEL_STUDIO_API_URL}${p}`, {
    headers: { Authorization: `Token ${env.LABEL_STUDIO_API_TOKEN}` },
  }).then((r) => r.json());
const hr = (t) => console.log(`\n${"═".repeat(72)}\n${t}\n${"═".repeat(72)}`);

let failures = 0;
const check = (label, pass, detail = "") => {
  if (!pass) failures += 1;
  console.log(`  ${pass ? "ok  " : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
};

try {
  await fetch(`${STUB}/__reset`, { method: "POST" });
} catch {
  console.log(`No stub HEALTH on ${STUB}. Start scripts/stub-health.mjs first.`);
  process.exit(1);
}

const PROJECT = Number(env.SENIOR_QUEUE_PROJECT || 191);
const stamp = Date.now().toString().slice(-6);

/* ── setup ───────────────────────────────────────────────────────── */
hr("SETUP");

const poolConfig = {
  purpose: "evaluate",
  instructions: "Probe pool.",
  schema: {
    primary_field: "verdict",
    classes: ["Normal", "Critical"],
    field_order: ["verdict", "rationale"],
    fields: {
      verdict: { type: "single", label: "Verdict", options: ["Correct", "Partial", "Incorrect"], required: true },
      rationale: { type: "text", label: "Why you judged it this way", required: true },
    },
  },
};

const makePool = async (name, config = poolConfig) =>
  (await (await q("pools", {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      name, ls_project_id: PROJECT, open_access: false,
      maximum_annotations: 3, calibration_items: 0, eval_config: config,
    }),
  })).json())[0];

// Two pools over the same project: one under test, one only to record a
// reading against, which is what proves the exclusion is not scoped to a pool.
const pool = await makePool(`TEMP — senior queue ${stamp}`);
const poolB = await makePool(`TEMP — senior queue B ${stamp}`, { purpose: "evaluate", schema: { fields: {} } });

const people = {};
for (const [tag, senior] of [["ordinary", false], ["senior", true], ["seniorwhoread", true]]) {
  const email = `godwinyampoi449+sq${tag}${stamp}@gmail.com`;
  const [c] = await (await q("clinicians", {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ email, name: `sq-${tag}`, access_code: Math.random().toString(36).slice(2, 10).toUpperCase(), active: true }),
  })).json();
  await q("pool_eligibility", {
    method: "POST",
    body: JSON.stringify({ clinician_id: c.id, pool_id: pool.id, eligible: true, senior, eligible_since: new Date().toISOString() }),
  });
  const token = await sessionFor(env, { clinicianId: c.id, email });
  people[tag] = {
    id: c.id, email,
    call: (p, i = {}) => fetch(`${APP}${p}`, { ...i, headers: { Cookie: `sessionToken=${token}`, "Content-Type": "application/json", ...i.headers } }),
  };
}

// Two real tasks, told to the stub as held. Two, so both note outcomes can be
// exercised: one the senior will happen to agree with, one they will not.
const listing = await LS(`/api/tasks/?project=${PROJECT}&page_size=8`);
const tasks = Array.isArray(listing) ? listing : (listing.tasks ?? []);
const [AGREE_TASK, DIFFER_TASK] = [tasks[0].id, tasks[1].id];

// Flat answer maps, which is the shape HEALTH actually sends.
const EARLIER = [
  { verdict: "Partial", rationale: "Incomplete but safe as written." },
  { verdict: "Correct", rationale: "Reasonable practice for this presentation." },
];
await fetch(`${STUB}/__held`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    project: PROJECT,
    held: [
      { ls_task_id: AGREE_TASK, idx: 11, project_id: PROJECT, case_id: "SPLIT-AGREE", agreement: 0.5, content: {}, earlier_answers: EARLIER },
      { ls_task_id: DIFFER_TASK, idx: 12, project_id: PROJECT, case_id: "SPLIT-DIFFER", agreement: 0.5, content: {}, earlier_answers: EARLIER },
    ],
  }),
});

// This senior read the first held case already — under the other pool.
await q("task_completions", {
  method: "POST",
  body: JSON.stringify({
    clinician_id: people.seniorwhoread.id, pool_id: poolB.id,
    ls_task_id: AGREE_TASK, kind: "judgement", annotation_data: { verdict: "Correct" },
  }),
});

console.log(`  pool "${pool.name}" over LS project ${PROJECT}`);
console.log(`  held: ${AGREE_TASK} and ${DIFFER_TASK}; one senior has already read ${AGREE_TASK}`);

const annotationsOn = async (id) => ((await LS(`/api/tasks/${id}/`)).annotations ?? []).length;
const before = { [AGREE_TASK]: await annotationsOn(AGREE_TASK), [DIFFER_TASK]: await annotationsOn(DIFFER_TASK) };
const sentToHealth = async () => (await (await fetch(`${STUB}/__received`)).json()).adjudications;

/* ── 1 ───────────────────────────────────────────────────────────── */
hr("1. A SENIOR WHO ALREADY READ THE CASE IS NOT OFFERED IT");
const partisan = await (await people.seniorwhoread.call(`/api/pools/${pool.id}/next`)).json();
console.log(`  offered: task ${partisan.task_id}`);
check("not the case they read", partisan.task_id !== AGREE_TASK, `(got ${partisan.task_id})`);
check("their reading was under another pool, which a pool-scoped check would miss",
  (await qj(`task_completions?clinician_id=eq.${people.seniorwhoread.id}&ls_task_id=eq.${AGREE_TASK}&select=pool_id`))[0]?.pool_id === poolB.id);

/* ── 2 ───────────────────────────────────────────────────────────── */
hr("2. A CLINICIAN WHO IS NOT SENIOR IS NEVER OFFERED A HELD CASE");
const ordinary = await (await people.ordinary.call(`/api/pools/${pool.id}/next`)).json();
console.log(`  offered: task ${ordinary.task_id}`);
check("neither held case", ![AGREE_TASK, DIFFER_TASK].includes(ordinary.task_id), `(got ${ordinary.task_id})`);
check("they are given ordinary work instead", Boolean(ordinary.task_id));

/* ── 3 ───────────────────────────────────────────────────────────── */
hr("3. THE SENIOR CANNOT TELL THE CASE WAS CONTESTED");
const offered = await (await people.senior.call(`/api/pools/${pool.id}/next`)).json();
console.log(`  offered: phase=${offered.phase} task=${offered.task_id} case=${offered.case_id}`);
check("a held case, ahead of unclaimed work", [AGREE_TASK, DIFFER_TASK].includes(offered.task_id), `(got ${offered.task_id})`);
check("served as an ordinary case", offered.phase === "single", `(${offered.phase})`);
const payload = JSON.stringify(offered);
check("no earlier answers in the payload", offered.earlier_answers === undefined);
check("no agreement figure either", offered.agreement === undefined);
for (const word of ["Incomplete but safe", "Reasonable practice", "adjudicat"]) {
  check(`nothing about the disagreement: "${word}"`, !payload.includes(word));
}
check("no author, as before", !/clinician_id|author_id|reviewer_id/.test(payload));
check("the rubric is there as usual", Boolean(offered.eval_config?.instructions));

/* ── 4 ───────────────────────────────────────────────────────────── */
hr("4. AGREEING WITH AN EARLIER READING IS RECORDED AS A MAJORITY");
const agreeing = { verdict: "Partial", rationale: "Judged on its own merits; incomplete for this presentation." };
const r1 = await people.senior.call(`/api/tasks/${AGREE_TASK}/submit`, { method: "POST", body: JSON.stringify({ answers: agreeing }) });
console.log(`  submit → HTTP ${r1.status}`);
check("accepted", r1.status === 200, `(${r1.status})`);
const first = (await sentToHealth()).find((a) => a.idx === 11);
console.log(`  note: ${String(first?.note ?? "").split("\n")[0]}`);
check("HEALTH was told", Boolean(first));
check("their own answer is the final label", first?.final_label?.verdict === "Partial");
check("the note records a majority", /matched an earlier reading/.test(first?.note ?? ""));
check("and says it was judged independently", /judging the case independently/.test(first?.note ?? ""));
check("their reasoning travelled too", /on its own merits/.test(first?.note ?? ""));
check("decided_by is a string naming them", typeof first?.decided_by === "string" && first.decided_by.includes(people.senior.id));

/* ── 5 ───────────────────────────────────────────────────────────── */
hr("5. AGREEING WITH NEITHER IS RECORDED AS THE SENIOR'S ANSWER STANDING");
const differing = { verdict: "Incorrect", rationale: "Both the plan and its framing are wrong here." };
const r2 = await people.senior.call(`/api/tasks/${DIFFER_TASK}/submit`, { method: "POST", body: JSON.stringify({ answers: differing }) });
console.log(`  submit → HTTP ${r2.status}`);
check("accepted", r2.status === 200, `(${r2.status})`);
const second = (await sentToHealth()).find((a) => a.idx === 12);
console.log(`  note: ${String(second?.note ?? "").split("\n")[0]}`);
check("the note records that no majority formed", /no majority formed/.test(second?.note ?? ""));
check("and that the senior's answer stands", /senior's answer stands/.test(second?.note ?? ""));
check("it names what everyone said", /"Incorrect"/.test(second?.note ?? "") && /"Partial"/.test(second?.note ?? ""));
check("their answer is still the final label", second?.final_label?.verdict === "Incorrect");

/* ── 6 ───────────────────────────────────────────────────────────── */
hr("6. RECORDED ONCE, AND NOTHING REACHES LABEL STUDIO");
for (const [task, label] of [[AGREE_TASK, "majority"], [DIFFER_TASK, "senior"]]) {
  const rows = await qj(`task_completions?ls_task_id=eq.${task}&kind=eq.adjudication&select=clinician_id`);
  check(`${label}: one adjudication row`, rows.length === 1, `(${rows.length})`);
  check(`${label}: annotations unchanged at ${before[task]}`, (await annotationsOn(task)) === before[task]);
}
const repeat = await people.senior.call(`/api/tasks/${AGREE_TASK}/submit`, { method: "POST", body: JSON.stringify({ answers: agreeing }) });
check("a second submission is refused", repeat.status === 409, `(${repeat.status})`);
check("HEALTH was not told twice", (await sentToHealth()).filter((a) => a.idx === 11).length === 1);

/* ── cleanup ─────────────────────────────────────────────────────── */
hr("CLEANUP");
for (const who of Object.values(people)) {
  for (const tbl of ["task_completions", "task_flags", "pool_eligibility", "sessions"]) {
    await q(`${tbl}?clinician_id=eq.${who.id}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${who.id}`, { method: "DELETE" });
}
for (const p of [pool.id, poolB.id]) await q(`pools?id=eq.${p}`, { method: "DELETE" });
const pools = await qj("pools?select=name&order=name");
console.log(`  probe pools removed: ${!pools.some((p) => p.name.includes(stamp))}`);
console.log(`  pools remaining: ${pools.map((p) => p.name.slice(0, 34)).join(" | ")}`);
console.log(`  annotations: ${AGREE_TASK} → ${await annotationsOn(AGREE_TASK)}, ${DIFFER_TASK} → ${await annotationsOn(DIFFER_TASK)} (unchanged)`);

console.log(failures === 0 ? "\n  ALL CHECKS PASSED" : `\n  ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
