/**
 * Evidence for the one extra reading a held case is allowed.
 *
 *   node scripts/verify-adjudication-slot.mjs
 *
 * A pool commissions a fixed number of readings per case. When they disagree
 * the case is held, and a senior's judgement is the way out — but the ceiling
 * exists to stop a case collecting more readings than the client paid for, so
 * the extra one has to be an exception that opens nothing else.
 *
 * What has to hold:
 *
 *   1. The ceiling still refuses an ordinary reading past it.
 *   2. Adjudicating buys exactly one reading beyond it.
 *   3. And only one: a second senior is refused.
 *   4. A clinician who already judged the case cannot adjudicate it, so nobody
 *      settles a disagreement they are one half of.
 *   5. Several seniors submitting at the same instant produce one extra
 *      reading between them, not one each. This is what the pool's row lock is
 *      for, so the test contends for the slot eight ways rather than two: two
 *      parallel requests might happen not to overlap, and a broken function
 *      would pass.
 *   6. Adjudicating does not raise the ceiling for anyone else.
 *
 * All of this is Postgres: a row lock, a count, a conditional limit. It needs
 * no Label Studio, so it runs against a pool invented for the purpose with
 * task ids that exist nowhere else — which is why it still works while there is
 * no webhook-free sandbox.
 */
import { loadEnv } from "./sandbox.mjs";

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

if ((await q("pool_eligibility?select=senior&limit=1")).status !== 200) {
  console.log("migrations/017_senior_reviewers.sql is not applied — stopping.");
  process.exit(1);
}

const CEILING = 2;
const stamp = Date.now().toString().slice(-6);

/* ── a pool of our own, backed by no real project ────────────────── */
hr("SETUP");
const [pool] = await (await q("pools", {
  method: "POST",
  headers: { ...H, Prefer: "return=representation" },
  body: JSON.stringify({
    name: `TEMP — adjudication probe ${stamp}`,
    // A project id nothing points at. Nothing here touches Label Studio.
    ls_project_id: 999000 + Number(stamp.slice(-3)),
    open_access: false,
    maximum_annotations: CEILING,
    calibration_items: 0,
    eval_config: {},
  }),
})).json();
console.log(`  pool "${pool.name}" commissioning ${CEILING} readings per case`);

const people = {};
const NAMES = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
for (const n of NAMES) {
  const [row] = await (await q("clinicians", {
    method: "POST",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({
      email: `godwinyampoi449+adj${n}${stamp}@gmail.com`,
      name: `adj-${n}`,
      access_code: Math.random().toString(36).slice(2, 10).toUpperCase(),
      active: true,
    }),
  })).json();
  people[n] = row.id;
}
console.log(`  ${NAMES.length} clinicians`);

const claim = (who, task, adjudication = false) =>
  qj("rpc/claim_task_slot", {
    method: "POST",
    body: JSON.stringify({
      p_clinician_id: people[who],
      p_pool_id: pool.id,
      p_ls_task_id: task,
      p_annotation_data: { probe: true },
      ...(adjudication ? { p_adjudication: true } : {}),
    }),
  });

const readings = async (task) =>
  (await qj(`task_completions?ls_task_id=eq.${task}&kind=eq.judgement&select=id`)).length;

/* ── 1 & 2 ───────────────────────────────────────────────────────── */
hr("1. THE CEILING STILL REFUSES AN ORDINARY THIRD READING");
const HELD = 900001;
console.log(`  A → ${await claim("a", HELD)}`);
console.log(`  B → ${await claim("b", HELD)}`);
check(`the case has its ${CEILING} readings`, (await readings(HELD)) === CEILING);
const ordinaryThird = await claim("c", HELD);
check("an ordinary third reading is refused", ordinaryThird === "full", `(${ordinaryThird})`);
check("and wrote nothing", (await readings(HELD)) === CEILING);

hr("2. ADJUDICATING BUYS EXACTLY ONE READING BEYOND IT");
const adjudicated = await claim("c", HELD, true);
check("the senior's judgement is taken", adjudicated === "claimed", `(${adjudicated})`);
check(`the case now has ${CEILING + 1} readings`, (await readings(HELD)) === CEILING + 1);
const [extra] = await qj(`task_completions?ls_task_id=eq.${HELD}&clinician_id=eq.${people.c}&select=kind`);
check("recorded as an ordinary judgement, so it is paid like one", extra?.kind === "judgement", `(${extra?.kind})`);

/* ── 3 ───────────────────────────────────────────────────────────── */
hr("3. AND ONLY ONE");
const secondSenior = await claim("d", HELD, true);
check("a second senior is refused", secondSenior === "full", `(${secondSenior})`);
check(`still ${CEILING + 1} readings`, (await readings(HELD)) === CEILING + 1);

/* ── 4 ───────────────────────────────────────────────────────────── */
hr("4. NOBODY SETTLES A DISAGREEMENT THEY ARE HALF OF");
const ownCase = await claim("a", HELD, true);
check("a clinician who already judged it is refused", ownCase === "already", `(${ownCase})`);
check(`still ${CEILING + 1} readings`, (await readings(HELD)) === CEILING + 1);

/* ── 5 ───────────────────────────────────────────────────────────── */
hr("5. SENIORS SUBMITTING AT THE SAME INSTANT PRODUCE ONE EXTRA READING");
const RACE = 900002;
await claim("a", RACE);
await claim("b", RACE);
check(`the case is at its ceiling`, (await readings(RACE)) === CEILING);

// Eight at once rather than two. Two parallel requests might happen not to
// overlap inside Postgres, in which case a broken function would still pass;
// eight contending for one slot is far harder to survive by luck.
const contenders = NAMES.slice(2);
const outcomes = await Promise.all(contenders.map((n) => claim(n, RACE, true)));
console.log(`  ${contenders.length} adjudications at once → ${JSON.stringify(outcomes)}`);
const claimed = outcomes.filter((r) => r === "claimed").length;
check("exactly one was taken", claimed === 1, `(${claimed})`);
check("every other was refused", outcomes.filter((r) => r === "full").length === contenders.length - 1);
check(`the case has ${CEILING + 1} readings, not more`, (await readings(RACE)) === CEILING + 1);

/* ── 6 ───────────────────────────────────────────────────────────── */
hr("6. ADJUDICATING OPENS NOTHING ELSE");
const OTHER = 900003;
await claim("a", OTHER);
await claim("b", OTHER);
const stillRefused = await claim("j", OTHER);
check("an ordinary case is still capped at its ceiling", stillRefused === "full", `(${stillRefused})`);
check(`it has ${CEILING} readings`, (await readings(OTHER)) === CEILING);
const untouched = await qj(`task_completions?pool_id=eq.${pool.id}&kind=eq.judgement&select=ls_task_id`);
const perCase = untouched.reduce((acc, r) => ({ ...acc, [r.ls_task_id]: (acc[r.ls_task_id] ?? 0) + 1 }), {});
console.log(`  readings per case across the probe: ${JSON.stringify(perCase)}`);
check("only the two held cases went past the ceiling",
  Object.values(perCase).filter((n) => n > CEILING).length === 2);

/* ── cleanup ─────────────────────────────────────────────────────── */
hr("CLEANUP");
for (const id of Object.values(people)) {
  for (const tbl of ["task_completions", "task_flags", "pool_eligibility", "sessions"]) {
    await q(`${tbl}?clinician_id=eq.${id}`, { method: "DELETE" });
  }
  await q(`clinicians?id=eq.${id}`, { method: "DELETE" });
}
await q(`pools?id=eq.${pool.id}`, { method: "DELETE" });
const poolsLeft = await qj("pools?select=name&order=name");
const strays = await qj(`clinicians?email=like.*adj*${stamp}*&select=id`);
console.log(`  probe pool removed: ${!poolsLeft.some((p) => p.name.includes(stamp))}`);
console.log(`  test clinicians removed: ${strays.length === 0}`);
console.log(`  pools remaining: ${poolsLeft.map((p) => p.name.slice(0, 34)).join(" | ") || "(none)"}`);

console.log(failures === 0 ? "\n  ALL CHECKS PASSED" : `\n  ${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
