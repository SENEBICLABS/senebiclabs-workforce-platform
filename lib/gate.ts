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
  lsProjectId: number;
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
   * Whether the pool's project is on the native task store. When it is, the
   * pool has no configuration of its own: evalConfig and maxAnnotations are
   * read from the HEALTH project, so they cannot drift from what HEALTH
   * scores against, and Label Studio is never called.
   */
  native: boolean;
  /** The HEALTH project this pool serves, when it has been linked to one. */
  projectId: string | null;
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

/** The pool columns every gate reads, with its project's config when linked. */
export const POOL_SELECT =
  "id, name, ls_project_id, eval_config, maximum_annotations, project_id, project:project_submissions(eval_config, task_store)";

/** The same columns before the native task store's migrations: Label Studio pools only. */
export const LEGACY_POOL_SELECT = "id, name, ls_project_id, eval_config, maximum_annotations";

/**
 * Whether a query failed because the native store's columns are not in the
 * database yet (workforce migration 021 or HEALTH migration 005 not applied):
 * an unknown column, or no relationship to embed.
 */
export function nativeSchemaMissing(error: { code?: string } | null | undefined): boolean {
  const code = error?.code;
  return code === "42703" || code === "PGRST200" || code === "PGRST204";
}

let warnedSchemaMissing = false;

/**
 * Runs a pool query with the native store's columns, and again with the
 * original ones if the database does not have them yet.
 *
 * This is what lets this app be deployed before or after the migrations. Before
 * them, every pool query failed, and the gate read that failure as "not
 * eligible": every clinician locked out of every pool. The retry is not a
 * fallback for native work: without those columns no project can be on the
 * native store, so every pool is a Label Studio pool and is served as one.
 */
export async function withPoolColumns<T>(
  run: (poolSelect: string) => PromiseLike<{ data: T | null; error: { code?: string } | null }>
): Promise<{ data: T | null; error: { code?: string } | null }> {
  const first = await run(POOL_SELECT);
  if (!nativeSchemaMissing(first.error)) return first;
  if (!warnedSchemaMissing) {
    warnedSchemaMissing = true;
    console.warn(
      "[gate] native task store columns are not in the database (apply workforce 021, then HEALTH 005); serving Label Studio pools only"
    );
  }
  return run(LEGACY_POOL_SELECT);
}

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
 * Reviews per task on the native store. HEALTH reads a missing or unreadable
 * count as 1 (ls._reviewers_target), and so does the database function that
 * enforces it, so this does too.
 */
export function ceilingFrom(config: Record<string, unknown> | null): number {
  const n = Number(config?.reviewers_per_item);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

export type PoolRow = Record<string, unknown> & {
  project?: { eval_config?: Record<string, unknown> | null; task_store?: string } | null;
};

/** The facts of a pool row, whichever store it is on. Pure, so it can be tested. */
export function poolFacts(pool: PoolRow) {
  const native = Boolean(pool.project_id) && pool.project?.task_store === "native";
  const projectConfig = native ? clinicianConfig(pool.project?.eval_config ?? null) : null;
  return {
    native,
    projectId: pool.project_id ? String(pool.project_id) : null,
    evalConfig: native
      ? projectConfig
      : clinicianConfig((pool.eval_config as Record<string, unknown> | null) ?? null),
    maxAnnotations: native
      ? ceilingFrom(projectConfig)
      : ((pool.maximum_annotations as number | null) ?? null),
  };
}

/** One shape for every gate, whichever store the pool is on. */
export async function toGatedPool(pool: PoolRow, senior: boolean): Promise<GatedPool> {
  return {
    id: String(pool.id),
    name: String(pool.name),
    lsProjectId: Number(pool.ls_project_id),
    senior,
    closedAt: await closedAtFor(String(pool.id)),
    ...poolFacts(pool),
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
  const { data } = await withPoolColumns((pools) =>
    supabaseAdmin
      .from("pool_eligibility")
      .select(`senior, pools!inner(${pools})`)
      .eq("clinician_id", clinicianId)
      .eq("pool_id", poolId)
      .eq("eligible", true)
      .maybeSingle()
  );

  const pool = (data as unknown as { pools?: PoolRow })?.pools;
  if (!pool) return null;

  return toGatedPool(pool, (data as unknown as { senior?: boolean })?.senior === true);
}

/**
 * Resolves the pool that owns an LS task, checking eligibility first.
 *
 * A task id alone is not authority to write: the task must belong to a project
 * backing a pool this clinician is gated into. Label Studio pools only: a
 * native pool is never matched by a Label Studio project id.
 */
export async function requireEligiblePoolForTask(
  clinicianId: string,
  lsTaskId: number,
  projectId: number
): Promise<GatedPool | null> {
  const { data: rows } = await withPoolColumns((pools) =>
    supabaseAdmin
      .from("pool_eligibility")
      .select(`pool_id, senior, pools!inner(${pools})`)
      .eq("clinician_id", clinicianId)
      .eq("eligible", true)
  );

  for (const row of (rows ?? []) as unknown as { senior?: boolean; pools: PoolRow }[]) {
    if (!row.pools || Number(row.pools.ls_project_id) !== projectId) continue;
    if (poolFacts(row.pools).native) continue;
    return toGatedPool(row.pools, row.senior === true);
  }
  return null;
}

/**
 * Resolves a native task and the pool this clinician may work it in, or null.
 *
 * The task's own project decides the pool (one pool per native project), so a
 * task number from another client's project can never be answered through a
 * pool this clinician holds. Null for "no such task" and "not yours" alike.
 */
export async function requireEligiblePoolForNativeTask(
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
  if (!poolFacts(row.pools).native) return null;
  return { pool: await toGatedPool(row.pools, row.senior === true), task };
}
