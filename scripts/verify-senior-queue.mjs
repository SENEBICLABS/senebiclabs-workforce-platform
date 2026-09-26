/**
 * Evidence for the senior review queue, against a stand-in for HEALTH.
 *
 *   node scripts/stub-health.mjs &                  # on 3457
 *   HEALTH_API_URL=http://localhost:3457 \
 *   HEALTH_ADMIN_KEY=stub-key npx next start -p 3000 &
 *   node scripts/verify-senior-queue.mjs
 *
 * What is being tested here is this platform's behaviour, not HEALTH's, so a
 * stub is the right counterparty: it lets the whole path run — the queue, the
 * gate, the payload a senior receives, the decision that goes back — without a
 * credential for the real service and without writing a real final answer over
 * a real client's case.
 *
 * Nothing reaches Label Studio. A senior's decision deliberately never writes
 * an annotation, so this can run against the live project's tasks: it reads
 * them to render the case and writes nothing back.
 *
 * What it proves:
 *
 *   0. A senior who already read the case is not offered it, even when their
 *      reading was recorded under a different pool over the same project.
 *   1. A clinician who is not senior is never offered a held case.
 *   2. A senior is offered it ahead of unclaimed work.
 *   3. The payload carries the earlier readings and no author.
 *   4. A decision that agrees with neither earlier reading still stands, and
 *      reaches HEALTH with the senior's reasoning.
 *   5. The pass is recorded once, as its own kind.
 *   6. Nothing is written to Label Studio.
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

// The stub has to be up, and the app has to have been started pointing at it.
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

// A pool of our own over the same project, so there is unclaimed work for a
// held case to be served ahead of. The live pool is read to its ceiling; this
// one commissions one more reading, which makes its cases claimable again
// without touching the live pool's configuration.
const [pool] = await (await q("pools", {
  method: "POST",
  headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify({
    name: `TEMP — senior queue ${stamp}`,
    ls_project_id: PROJECT,
    open_access: false,
    maximum_annotations: 3,
    calibration_items: 0,
    eval_config: {
      purpose: "evaluate",
      instructions: "Probe pool.",
      schema: {
        classes: ["Normal", "Critical"],
        field_order: ["verdict", "rationale"],
        fields: {
          verdict: { type: "single", label: "Verdict", options: ["Correct", "Partial", "Incorrect"], required: true },
          rationale: { type: "text", label: "Why you judged it this way", required: true },
        },
      },
    },
  }),
})).json();

// A second pool over the same Label Studio project. A case is one case
// whichever pool row served it, and this is what proves the exclusion is not
// quietly scoped to a pool.
const [poolB] = await (await q("pools", {
  method: "POST",
  headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify({
    name: `TEMP — senior queue B ${stamp}`,
    ls_project_id: PROJECT,
    open_access: false,
    maximum_annotations: 3,
    calibration_items: 0,
    eval_config: { purpose: "evaluate", schema: { fields: {} } },
  }),
})).json();

const people = {};
for (const [tag, senior] of [["ordinary", false], ["senior", true], ["seniorWhoRead", true]]) {
  // Addresses are lowercase at rest — there is a check constraint saying so,
  // and the gate normalises to match. The tag keeps its shape for the name.
  const email = `godwinyampoi449+sq${tag.toLowerCase()}${stamp}@gmail.com`;
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
console.log(`  pool "${pool.name}" over LS project ${PROJECT}`);
console.log(`  a second pool over the same project, for the cross-pool check`);
console.log(`  one ordinary clinician, one senior, one senior who already read the case`);

// Pick a real task from the project and tell the stub it is held.
const listing = await LS(`/api/tasks/?project=${PROJECT}&page_size=5`);
const tasks = Array.isArray(listing) ? listing : (listing.tasks ?? []);
const HELD_TASK = tasks[0].id;
const EARLIER = [
  { answers: { verdict: "Correct", rationale: "Reads as a normal result for this presentation." } },
  { answers: { verdict: "Incorrect", rationale: "Misses the raised inflammatory markers entirely." } },
];
await fetch(`${STUB}/__held`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    project: PROJECT,
    held: [{
      ls_task_id: HELD_TASK, idx: 7, project_id: PROJECT, case_id: "LAB-07",
      agreement: 0.5, content: {}, earlier_answers: EARLIER,
    }],
  }),
});
console.log(`  stub is holding task ${HELD_TASK}, with two disagreeing readings`);

// This senior read the held case already — under the other pool, which is the
// part that would slip past a pool-scoped check.
await q("task_completions", {
  method: "POST",
  body: JSON.stringify({
    clinician_id: people.seniorWhoRead.id,
    pool_id: poolB.id,
    ls_task_id: HELD_TASK,
    kind: "judgement",
    annotation_data: { verdict: "Correct" },
  }),
});
console.log(`  the third clinician's reading of task ${HELD_TASK} is recorded under the other pool`);

const annotationsOn = async (taskId) =>
  ((await LS(`/api/tasks/${taskId}/`)).annotations ?? []).length;
const annotationsBefore = await annotationsOn(HELD_TASK);

/* ── 1 ───────────────────────────────────────────────────────────── */
hr("1. A CLINICIAN WHO IS NOT SENIOR IS NEVER OFFERED A HELD CASE");
const ordinary = await (await people.ordinary.call(`/api/pools/${pool.id}/next`)).json();
console.log(`  offered: phase=${ordinary.phase} task=${ordinary.task_id}`);
check("not the held case", ordinary.task_id !== HELD_TASK, `(got ${ordinary.task_id})`);
check("and not the adjudicate phase", ordinary.phase !== "adjudicate", `(${ordinary.phase})`);
check("they are given ordinary work instead", Boolean(ordinary.task_id));

/* ── 2 & 3 ───────────────────────────────────────────────────────── */
hr("2. A SENIOR IS OFFERED IT AHEAD OF UNCLAIMED WORK");
const offered = await (await people.senior.call(`/api/pools/${pool.id}/next`)).json();
console.log(`  offered: phase=${offered.phase} task=${offered.task_id} case=${offered.case_id}`);
check("the held case", offered.task_id === HELD_TASK, `(got ${offered.task_id})`);
check("in the adjudicate phase", offered.phase === "adjudicate", `(${offered.phase})`);
check("even though unclaimed work exists", Boolean(ordinary.task_id) && ordinary.task_id !== HELD_TASK);

hr("3. THE PAYLOAD CARRIES THE DISAGREEMENT, AND NO AUTHOR");
check("both earlier readings are there", (offered.earlier_answers ?? []).length === 2, `(${(offered.earlier_answers ?? []).length})`);
check("their reasoning too", JSON.stringify(offered.earlier_answers ?? []).includes("inflammatory markers"));
const blob = JSON.stringify(offered);
check("no clinician id anywhere in it", !blob.includes(people.ordinary.id) && !blob.includes(people.senior.id));
for (const word of ["clinician_id", "email", "reviewer_id", "author_id"]) {
  check(`no "${word}" in the payload`, !blob.includes(word));
}
check("the rubric is there as usual", Boolean(offered.eval_config?.instructions));

/* ── 4 ───────────────────────────────────────────────────────────── */
hr("3b. A SENIOR WHO ALREADY READ THE CASE IS NOT OFFERED IT");
const partisan = await people.seniorWhoRead.call(`/api/pools/${pool.id}/next`);
const partisanBody = partisan.status === 204 ? {} : await partisan.json();
console.log(`  offered: HTTP ${partisan.status} phase=${partisanBody.phase} task=${partisanBody.task_id}`);
check("not their own disagreement", partisanBody.task_id !== HELD_TASK, `(got ${partisanBody.task_id})`);
check("and not the adjudicate phase", partisanBody.phase !== "adjudicate", `(${partisanBody.phase})`);
check(
  "their reading was under another pool, so a pool-scoped check would have missed it",
  (await qj(`task_completions?clinician_id=eq.${people.seniorWhoRead.id}&ls_task_id=eq.${HELD_TASK}&select=pool_id`))[0]?.pool_id === poolB.id
);
// It stays held rather than being consumed or closed: a senior who has not
// read it is still offered it. With no such senior left, this is where the
// case waits for an operator, which is the intended floor rather than a gap.
const stillOffered = await (await people.senior.call(`/api/pools/${pool.id}/next`)).json();
check("the case is still waiting for a senior who has not read it",
  stillOffered.task_id === HELD_TASK && stillOffered.phase === "adjudicate",
  `(${stillOffered.phase} ${stillOffered.task_id})`);

hr("4. A DECISION AGREEING WITH NEITHER READING STILL STANDS");
const DECISION = { verdict: "Partial", rationale: "Both readings overstate their case; the result is equivocal and needs repeating." };
const submitted = await people.senior.call(`/api/tasks/${HELD_TASK}/submit`, {
  method: "POST", body: JSON.stringify({ answers: DECISION }),
});
const body = await submitted.json();
console.log(`  POST submit → HTTP ${submitted.status}  ${JSON.stringify({ phase: body.phase, settled: body.settled })}`);
check("accepted", submitted.status === 200, `(${submitted.status})`);
check("reported as settled", body.settled === true);

const received = await (await fetch(`${STUB}/__received`)).json();
const sent = received.adjudications?.[0];
console.log(`  HEALTH received: ${JSON.stringify(sent?.final_label)}`);
check("HEALTH was told", Boolean(sent));
check("with the senior's own answer", sent?.final_label?.verdict === "Partial", `(${sent?.final_label?.verdict})`);
check("which matches neither earlier reading",
  EARLIER.every((e) => e.answers.verdict !== sent?.final_label?.verdict));
check("their reasoning travelled with it", String(sent?.note ?? "").includes("equivocal"), `(${String(sent?.note ?? "").slice(0, 40)})`);
check("addressed by HEALTH's own index", sent?.idx === 7, `(${sent?.idx})`);
check("and says who decided it", String(sent?.decided_by ?? "").includes(people.senior.id),
  `(${String(sent?.decided_by ?? "").slice(0, 46)})`);
check("as a single string, which is what HEALTH validates",
  typeof sent?.decided_by === "string", `(${typeof sent?.decided_by})`);

/* ── 5 & 6 ───────────────────────────────────────────────────────── */
hr("5. THE PASS IS RECORDED ONCE, AS ITS OWN KIND");
const rows = await qj(`task_completions?ls_task_id=eq.${HELD_TASK}&clinician_id=eq.${people.senior.id}&select=kind`);
check("one row", rows.length === 1, `(${rows.length})`);
check("of kind adjudication", rows[0]?.kind === "adjudication", `(${rows[0]?.kind})`);

const repeat = await people.senior.call(`/api/tasks/${HELD_TASK}/submit`, {
  method: "POST", body: JSON.stringify({ answers: DECISION }),
});
console.log(`  submitting again → HTTP ${repeat.status}  ${JSON.stringify(await repeat.json()).slice(0, 80)}`);
check("a second submission is refused", repeat.status === 409, `(${repeat.status})`);
check("still one row", (await qj(`task_completions?ls_task_id=eq.${HELD_TASK}&kind=eq.adjudication&select=id`)).length === 1);
check("and HEALTH was not told twice", (await (await fetch(`${STUB}/__received`)).json()).adjudications.length === 1);

hr("6. NOTHING WAS WRITTEN TO LABEL STUDIO");
const annotationsAfter = await annotationsOn(HELD_TASK);
check(`annotations unchanged at ${annotationsBefore}`, annotationsAfter === annotationsBefore, `(now ${annotationsAfter})`);

/* ── cleanup ─────────────────────────────────────────────────────── */
hr("CLEANUP");
for (const who of Object.values(people)) {
  for (const tbl of ["task_completions", "task_flags", "pool_eligibility", "sessions"]) {
    await q(`${tbl}?clinician_id=eq.${who.id}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${who.id}`, { method: "DELETE" });
}
await q(`pools?id=eq.${pool.id}`, { method: "DELETE" });
await q(`pools?id=eq.${poolB.id}`, { method: "DELETE" });
const pools = await qj("pools?select=name&order=name");
console.log(`  probe pool removed: ${!pools.some((p) => p.name.includes(stamp))}`);
console.log(`  pools remaining: ${pools.map((p) => p.name.slice(0, 34)).join(" | ")}`);
console.log(`  annotations on task ${HELD_TASK}: ${await annotationsOn(HELD_TASK)} (unchanged)`);

console.log(failures === 0 ? "\n  ALL CHECKS PASSED" : `\n  ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
