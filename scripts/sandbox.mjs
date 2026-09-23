/**
 * Where a write-path test is allowed to write.
 *
 * Every verification script used to name Label Studio project 38 in its own
 * source. That project was deleted, so all of them died at the guard, and the
 * write path went unproven for as long as nobody looked. Worse, the number was
 * a literal in six files: pointing the suite at a different project meant
 * editing all six, and editing one of them wrongly meant writing into a project
 * that feeds HEALTH.
 *
 * So the sandbox is named once, in the environment, and resolved here. A script
 * asks for the kind of sandbox it needs and gets a project and a pool that have
 * been checked together. There is no way to ask for "project 40".
 *
 * Two kinds, because the product has two shapes of work:
 *
 *   judge   a case is assessed against a rubric; several clinicians may each
 *           assess the same case (maximum_annotations > 1)
 *   author  one clinician writes an answer and a second reads it before it is
 *           published (review_required, maximum_annotations 1)
 *
 * Every resolution runs assertTestProject, which refuses a project with a
 * webhook. That guard stays in front of every path, including this one: it is
 * what stopped this suite from delivering test junk into HEALTH, and it is
 * cheap to keep.
 */

import fs from "fs";
import { assertTestProject } from "./assert-test-project.mjs";

export function loadEnv(file = ".env.local") {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
}

const KINDS = {
  judge: { project: "SANDBOX_LS_PROJECT", pool: "SANDBOX_POOL_ID" },
  author: { project: "SANDBOX_REVIEW_LS_PROJECT", pool: "SANDBOX_REVIEW_POOL_ID" },
};

/**
 * Resolves a sandbox, or refuses to let the script run.
 *
 * Checks, in order, because a later one is meaningless if an earlier one fails:
 *   1. both variables are set
 *   2. the project has no webhook (assertTestProject; a failed lookup also
 *      refuses, so an unreachable Label Studio cannot be read as "safe")
 *   3. the pool row exists
 *   4. the pool and the project point at each other
 *
 * Step 4 is the one that earns its keep. Without it a stale SANDBOX_POOL_ID
 * with a fresh SANDBOX_LS_PROJECT would write annotations into the sandbox and
 * completion rows against whatever pool the id happened to name, which could be
 * the pilot. The guard checks the project; this checks that the pool the script
 * will write rows for is that same project.
 */
export async function resolveSandbox(kind, env, restQuery) {
  const names = KINDS[kind];
  if (!names) throw new Error(`Unknown sandbox kind "${kind}". Use judge or author.`);

  const project = Number(env[names.project]);
  const poolId = env[names.pool];

  if (!project || !poolId) {
    throw new Error(
      `${names.project} and ${names.pool} must both be set in .env.local.\n` +
        "They name the webhook-free sandbox this suite is allowed to write to.\n" +
        "Never point them at a pool whose Label Studio project feeds HEALTH."
    );
  }

  await assertTestProject(project);

  const rows = await restQuery(
    `pools?id=eq.${poolId}&select=id,name,ls_project_id,eval_config,maximum_annotations`
  );
  const pool = rows[0];

  if (!pool) {
    throw new Error(`${names.pool} is ${poolId}, but no pool has that id. Refusing to proceed.`);
  }

  if (Number(pool.ls_project_id) !== project) {
    throw new Error(
      `Sandbox mismatch. ${names.pool} (${poolId}) is backed by Label Studio ` +
        `project ${pool.ls_project_id}, but ${names.project} says ${project}.\n` +
        "One of them is stale. Refusing to write rows for one project into another."
    );
  }

  return { project, poolId, pool };
}
