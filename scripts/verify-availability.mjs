/**
 * Does the pool list agree with the queue?
 *
 *   node scripts/verify-availability.mjs [email ...]
 *
 * This is the check for the bug that produced lib/availability: a card reading
 * "in progress" with a button, over a queue that had nothing to serve. The two
 * now come from one computation, and the only way to be sure they still do is
 * to ask both and compare — a unit test cannot, because the disagreement lived
 * in the gap between two separate reads of the same pool.
 *
 * It lists pools and asks for the next case, which is what a clinician's browser does on
 * every dashboard load.
 *
 * NO LONGER READ-ONLY. Since HEALTH's migration 009, asking for the next case holds it:
 * one row in item_reservations per clinician per pool, for the clinician this script is
 * impersonating. Nothing is deleted or altered and every hold lapses within the hour, but
 * while they are live those cases are not offered to anybody else. Run it against a
 * throwaway stack (HEALTH's scripts/native_e2e_stack.sh), not a live project, and do not
 * run it in the middle of a sitting.
 *
 * Every clinician given on the command line is checked, defaulting to everyone
 * with pool access, because the interesting disagreements are per person: a
 * senior sees held cases nobody else does, and a clinician who has worked a
 * pool out sees nothing where a colleague still sees work.
 */
import { loadEnv, remoteGuard } from "./env.mjs";
import { sessionFor } from "./session-for.mjs";

const env = loadEnv();
const APP = env.APP_URL || "http://localhost:3000";

// Fail closed before anything is asked for. The decision is made on the database's URL,
// never the app's: a Next server on localhost reads this same .env.local, so a local
// APP_URL in front of a hosted project still writes to that project.
const guard = remoteGuard({
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  allowRemote: process.env.ALLOW_REMOTE,
});
if (!guard.ok) {
  console.error(`  REFUSING TO RUN. ${guard.reason}`);
  process.exit(2);
}
if (guard.remote) {
  console.error("  ALLOW_REMOTE=1: running against a hosted database. Holds are released");
  console.error("  on the way out, but do not do this in the middle of a sitting.\n");
}

const supabase = async (path, init = {}) => {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
};

const rest = (path) => supabase(path);

/**
 * Every case this run was served, so each can be handed back.
 *
 * Asking for the next case holds it (HEALTH migration 009). That is the whole reason this
 * script is no longer read-only, and leaving the holds behind would withhold real work for
 * an hour for the sake of a check that takes seconds.
 */
const holds = [];

async function releaseHolds() {
  if (holds.length === 0) return;
  const stuck = [];
  for (const hold of holds) {
    try {
      await supabase("rpc/release_reservation", {
        method: "POST",
        body: JSON.stringify({
          p_clinician_id: hold.clinicianId,
          p_task_no: hold.taskNo,
          p_reason: "verify-availability",
        }),
      });
    } catch {
      stuck.push(hold);
    }
  }
  if (stuck.length === 0) {
    console.log(`\n  ${holds.length} hold(s) released`);
    return;
  }
  // Named so an operator can finish the job by hand. Ids only: no email, no secrets.
  console.error(`\n  ${stuck.length} of ${holds.length} hold(s) could NOT be released.`);
  console.error("  Release them with, for each line below:");
  console.error("    select release_reservation('<clinician>', <task>, 'manual');");
  for (const h of stuck) {
    console.error(`    clinician=${h.clinicianId} task=${h.taskNo} pool=${h.poolId}`);
  }
}

const asked = process.argv.slice(2);

const clinicians = asked.length
  ? await rest(
      `clinicians?email=in.(${asked.map(encodeURIComponent).join(",")})&select=id,email`
    )
  : await rest("clinicians?select=id,email&order=created_at");

if (clinicians.length === 0) {
  console.log("  No clinicians to check.");
  process.exit(1);
}

let failures = 0;
let checked = 0;

try {
for (const clinician of clinicians) {
  const token = await sessionFor(env, {
    clinicianId: clinician.id,
    email: clinician.email,
  });
  const headers = { Cookie: `sessionToken=${token}` };

  const listed = await fetch(`${APP}/api/pools`, { headers });
  if (!listed.ok) {
    console.log(`  ${clinician.email}: /api/pools -> ${listed.status}  FAIL`);
    failures++;
    continue;
  }
  const { pools } = await listed.json();

  if (pools.length === 0) {
    console.log(`  ${clinician.email}: no pools`);
    continue;
  }

  console.log(`  ${clinician.email}`);

  for (const pool of pools) {
    const res = await fetch(`${APP}/api/pools/${pool.id}/next`, { headers });
    const serves = res.status === 200;
    checked++;

    // A served case is a held case. Remember it before anything else can fail, so the
    // cleanup below can hand it back even if this run stops early.
    if (serves) {
      const body = await res.clone().json().catch(() => null);
      if (body?.task_id) {
        holds.push({
          clinicianId: clinician.id,
          taskNo: body.task_id,
          poolId: pool.id,
        });
      }
    }

    // A null count means the case store could not be read. The list says so
    // rather than claiming zero, and there is nothing to compare: the queue
    // will fail the same way, and both are honest about it.
    const claims = pool.available_to_you === null ? null : pool.available_to_you > 0;

    const problems = [];
    if (claims !== null && claims !== serves) {
      problems.push(
        claims
          ? "the list offered work the queue does not have"
          : "the queue has work the list does not offer"
      );
    }
    // A closed pool must serve nothing, whatever remains in it.
    if (pool.closed && serves) problems.push("a closed pool served a case");
    // The button is rendered from the same two fields, so a pool that offers
    // work must not also be closed.
    if (pool.closed && claims) problems.push("a closed pool reported work available");

    const verdict = problems.length === 0 ? "ok" : `FAIL: ${problems.join("; ")}`;
    if (problems.length > 0) failures++;

    console.log(
      `    ${pool.name.slice(0, 34).padEnd(34)}` +
        ` available=${String(pool.available_to_you).padStart(4)}` +
        ` done=${String(pool.completed_by_you).padStart(3)}` +
        ` closed=${String(pool.closed).padEnd(5)}` +
        ` /next=${res.status}  ${verdict}`
    );
  }
}

} finally {
  // However this run ended, including a thrown assertion, the cases go back.
  // process.exit does not unwind, so it is deliberately after this block.
  await releaseHolds();
}

console.log(
  failures === 0
    ? `\n  ${checked} pool view(s) checked, the list and the queue agree everywhere`
    : `\n  ${failures} disagreement(s) across ${checked} pool view(s)`
);
process.exit(failures === 0 ? 0 : 1);
