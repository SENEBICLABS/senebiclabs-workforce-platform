import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase";
import { closedAtFor } from "./pool-closure";
import { getNativeTask, type NativeTask } from "./taskstore";

/**
 * The confidentiality gate.
 *
 * Every pool- or task-scoped request re-checks eligibility here against the
 * database. Nothing about eligibility is ever taken from the client, and a
 * refusal reveals nothing about the pool — same 403 body whether the pool
 * exists or not.
 */

export interface GatedPool {
  id: string;
  name: string;
  maxAnnotations: number | null;
  evalConfig: Record<string, unknown> | null;
  /**
   * Whether this clinician settles disagreements in this pool.
   *
   * It rides along with eligibility because it is the same row and the same
   * round trip, and because every place that asks "may they have this pool"
   * is also a place that may need to ask "and do they decide here". Read from
   * the database on every request, like eligibility itself, so revoking it is
   * a row change rather than a deploy.
   */
  senior: boolean;
  /** When an operator closed this pool to clinicians, or null while it is open. */
  closedAt: string | null;
  /**
   * The HEALTH project this pool serves. The pool has no configuration of its
   * own: evalConfig and maxAnnotations are read from that project, so they
   * cannot drift from what HEALTH scores against.
   */
  projectId: string;
}

export const FORBIDDEN = () =>
  NextResponse.json(
    { error: "You are not eligible for this pool." },
    { status: 403 }
  );

/**
 * A pool an operator has closed takes no more work.
 *
 * Separate from FORBIDDEN, and worded plainly, because it is not a refusal of
 * this clinician: they were eligible a moment ago and the pool stopped, which
 * is a different thing to be told. It is a real refusal rather than a greyed
 * button, because a tab open since before the pool closed would otherwise still
 * submit into a project that has already gone downstream.
 */
export const POOL_CLOSED = () =>
  NextResponse.json(
    { error: "This pool is closed and is no longer taking work." },
    { status: 409 }
  );

/**
 * The pool columns every gate reads, with its project's config.
 *
 * pools.ls_project_id is not read: nothing uses that column any more, and it
 * goes with a later migration.
 */
export const POOL_SELECT =
  "id, name, eval_config, maximum_annotations, project_id, project:project_submissions(eval_config)";

/**
 * A project's config as the platform may use it.
 *
 * HEALTH keeps internal state on the same object (a client's webhook secret,
 * ingestion markers), all under keys starting with "_". None of it is a
 * question for a clinician, and the secret must never travel further than this
 * function, so it is dropped here, at the one place the config is read.
 */
export function clinicianConfig(
  raw: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!raw) return null;
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !key.startsWith("_")));
}

/**
 * Reviews per task. HEALTH reads a missing or unreadable count as 1, and so does
 * the database function that enforces it, so this does too.
 */
export function ceilingFrom(config: Record<string, unknown> | null): number {
  const n = Number(config?.reviewers_per_item);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export type PoolRow = Record<string, unknown> & {
  project?: { eval_config?: Record<string, unknown> | null } | null;
};

/**
 * The facts of a pool row, or null for a pool no clinician may be served from.
 *
 * Every pool serves one HEALTH project. A pool with no project has no tasks to
 * serve, so it is treated exactly like a pool that does not exist.
 * Pure, so it can be tested.
 */
export function poolFacts(pool: PoolRow) {
  if (!pool.project_id) return null;
  const evalConfig = clinicianConfig(pool.project?.eval_config ?? null);
  return {
    projectId: String(pool.project_id),
    evalConfig,
    maxAnnotations: ceilingFrom(evalConfig),
  };
}

/** One shape for every gate. Null for a pool with no project (see poolFacts). */
export async function toGatedPool(pool: PoolRow, senior: boolean): Promise<GatedPool | null> {
  const facts = poolFacts(pool);
  if (!facts) return null;
  return {
    id: String(pool.id),
    name: String(pool.name),
    senior,
    closedAt: await closedAtFor(String(pool.id)),
    ...facts,
  };
}

/**
 * Resolves a pool for a clinician, or null if they may not have it.
 *
 * Returns null for "does not exist" and for "exists but not eligible" alike, so
 * callers cannot leak the difference.
 */
export async function requireEligiblePool(
  clinicianId: string,
  poolId: string
): Promise<GatedPool | null> {
  if (!poolId || typeof poolId !== "string") return null;

  // One round trip, not two: the inner join yields nothing when the pool does
  // not exist and nothing when the clinician is not eligible, which is exactly
  // the indistinguishable refusal this gate owes callers.
  const { data } = await supabaseAdmin
    .from("pool_eligibility")
    .select(`senior, pools!inner(${POOL_SELECT})`)
    .eq("clinician_id", clinicianId)
    .eq("pool_id", poolId)
    .eq("eligible", true)
    .maybeSingle();

  const pool = (data as unknown as { pools?: PoolRow })?.pools;
  if (!pool) return null;

  return toGatedPool(pool, (data as unknown as { senior?: boolean })?.senior === true);
}

/**
 * Resolves a task and the pool this clinician may work it in, or null.
 *
 * A task id alone is not authority to write. The task's own project decides the
 * pool (one pool per project), so a task number from another client's project
 * can never be answered through a pool this clinician holds. Null for "no such
 * task" and "not yours" alike.
 */
export async function requireEligiblePoolForTask(
  clinicianId: string,
  taskNo: number
): Promise<{ pool: GatedPool; task: NativeTask } | null> {
  const task = await getNativeTask(taskNo);
  if (!task) return null;

  const { data } = await supabaseAdmin
    .from("pool_eligibility")
    .select(`senior, pools!inner(${POOL_SELECT})`)
    .eq("clinician_id", clinicianId)
    .eq("eligible", true)
    .eq("pools.project_id", task.projectId)
    .maybeSingle();

  const row = data as unknown as { senior?: boolean; pools?: PoolRow } | null;
  if (!row?.pools) return null;
  const pool = await toGatedPool(row.pools, row.senior === true);
  return pool ? { pool, task } : null;
}
