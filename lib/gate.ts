import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase";

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
}

export const FORBIDDEN = () =>
  NextResponse.json(
    { error: "You are not eligible for this pool." },
    { status: 403 }
  );

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
    .select(
      "senior, pools!inner(id, name, ls_project_id, eval_config, maximum_annotations)"
    )
    .eq("clinician_id", clinicianId)
    .eq("pool_id", poolId)
    .eq("eligible", true)
    .maybeSingle();

  const pool = (data as unknown as { pools?: Record<string, unknown> })?.pools;
  if (!pool) return null;

  return {
    id: String(pool.id),
    name: String(pool.name),
    lsProjectId: Number(pool.ls_project_id),
    maxAnnotations: (pool.maximum_annotations as number | null) ?? null,
    evalConfig: (pool.eval_config as Record<string, unknown> | null) ?? null,
    senior: (data as unknown as { senior?: boolean })?.senior === true,
  };
}

/**
 * Resolves the pool that owns an LS task, checking eligibility first.
 *
 * A task id alone is not authority to write: the task must belong to a project
 * backing a pool this clinician is gated into.
 */
export async function requireEligiblePoolForTask(
  clinicianId: string,
  lsTaskId: number,
  projectId: number
): Promise<GatedPool | null> {
  const { data: rows } = await supabaseAdmin
    .from("pool_eligibility")
    .select("pool_id, senior, pools!inner(id, name, ls_project_id, eval_config, maximum_annotations)")
    .eq("clinician_id", clinicianId)
    .eq("eligible", true);

  const match = (rows ?? [])
    .map((row) => row as unknown as { senior?: boolean; pools: Record<string, unknown> })
    .find((row) => row.pools && Number(row.pools.ls_project_id) === projectId);

  if (!match) return null;

  const pool = match.pools;
  return {
    id: String(pool.id),
    name: String(pool.name),
    lsProjectId: Number(pool.ls_project_id),
    maxAnnotations: (pool.maximum_annotations as number | null) ?? null,
    evalConfig: (pool.eval_config as Record<string, unknown> | null) ?? null,
    senior: match.senior === true,
  };
}
