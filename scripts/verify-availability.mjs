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
 * Read-only. It lists pools and asks for the next case, which is what a
 * clinician's browser does on every dashboard load, and writes nothing
 * anywhere. Safe against live projects, which is the point: it has no write
 * path to guard.
 *
 * Every clinician given on the command line is checked, defaulting to everyone
 * with pool access, because the interesting disagreements are per person: a
 * senior sees held cases nobody else does, and a clinician who has worked a
 * pool out sees nothing where a colleague still sees work.
 */
import { loadEnv } from "./env.mjs";
import { sessionFor } from "./session-for.mjs";

const env = loadEnv();
const APP = env.APP_URL || "http://localhost:3000";

const rest = async (path) => {
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${path} -> ${res.status}`);
  return res.json();
};

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

console.log(
  failures === 0
    ? `\n  ${checked} pool view(s) checked, the list and the queue agree everywhere`
    : `\n  ${failures} disagreement(s) across ${checked} pool view(s)`
);
process.exit(failures === 0 ? 0 : 1);
