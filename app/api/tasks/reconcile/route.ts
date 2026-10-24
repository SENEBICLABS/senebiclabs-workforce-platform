import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";
import { deleteAnnotation, listTasks } from "@/lib/labelstudio";
import { reviewRequired } from "@/lib/review";
import type { RawEvalConfig } from "@/lib/eval-config";
import { poolFacts, withPoolColumns, type PoolRow } from "@/lib/gate";

export const dynamic = "force-dynamic";

/**
 * Divergence between Label Studio and our completion records.
 *
 * An orphan is an annotation in LS with no completion row behind it — the
 * signature of a write that succeeded in LS and then failed to record. Submit
 * rolls those back itself; this endpoint is the safety net for the case where
 * the rollback also failed, and the monitor for whether that is happening.
 *
 * Operator endpoint: authorised by OPS_API_KEY, never a clinician session.
 */

interface Orphan {
  ls_task_id: number;
  annotation_id: number;
  created_at: string | null;
}

/**
 * What "no divergence" means depends on how the pool works.
 *
 * A consensus pool publishes one annotation per completed review, so the two
 * counts should match. A review pool does not: an item is authored and then
 * approved, both are paid work and both are completions, and a rejected draft
 * adds another completion with no annotation at all. Comparing completions to
 * annotations there reports divergence that is simply the flow working.
 *
 * The invariant that does hold for a review pool is that Label Studio carries
 * exactly the approved items — one published annotation each.
 */
interface Reconciliation {
  mode: "consensus" | "review";
  orphans: Orphan[];
  lsCount: number;
  /** What LS is being compared against: completions, or approved items. */
  expected: number;
  diverged: boolean;
  /** Present for review pools: completions are counted, never compared. */
  work?: {
    completions_total: number;
    approved_items: number;
    awaiting_review: number;
    awaiting_author: number;
    rejections: number;
  };
}

/**
 * Whether this project backs more than one pool.
 *
 * Label Studio annotations carry no pool, so when several pools sit on one
 * project an annotation cannot be attributed to any of them. Comparing one
 * pool's completions against the project's annotations would then report every
 * other pool's work — and the cleanup would delete it.
 */
async function sharedProject(projectId: number, poolId: string) {
  const { data } = await supabaseAdmin
    .from("pools")
    .select("id, name")
    .eq("ls_project_id", projectId);

  const others = (data ?? []).filter((p) => p.id !== poolId);
  return others.length > 0 ? others.map((p) => p.name) : null;
}

async function reconcile(
  poolId: string,
  projectId: number,
  raw: RawEvalConfig | null
): Promise<Reconciliation> {
  const tasks = await listTasks(projectId);

  if (reviewRequired(raw)) return reconcileReview(poolId, tasks);
  return reconcileConsensus(poolId, tasks);
}

type LsTaskLite = {
  id: number;
  annotations?: { id: number; created_at?: string }[];
};

/** One annotation per completed review; the counts should match. */
async function reconcileConsensus(
  poolId: string,
  tasks: LsTaskLite[]
): Promise<Reconciliation> {
  // Readings only. A flag produces no annotation by design, so counting flag
  // rows here would report a divergence between the table and Label Studio on
  // every honestly flagged case.
  const { data: completions } = await supabaseAdmin
    .from("task_completions")
    .select("ls_task_id")
    .eq("pool_id", poolId)
    .in("kind", READINGS_ONLY);

  const recorded = new Map<number, number>();
  for (const row of completions ?? []) {
    recorded.set(row.ls_task_id, (recorded.get(row.ls_task_id) ?? 0) + 1);
  }

  const orphans: Orphan[] = [];
  let lsCount = 0;

  for (const task of tasks) {
    const annotations = task.annotations ?? [];
    lsCount += annotations.length;

    const surplus = annotations.length - (recorded.get(task.id) ?? 0);
    if (surplus <= 0) continue;

    // The newest annotations are the ones a failed write would have left.
    for (const annotation of annotations.slice(-surplus)) {
      orphans.push({
        ls_task_id: task.id,
        annotation_id: annotation.id,
        created_at: annotation.created_at ?? null,
      });
    }
  }

  const expected = completions?.length ?? 0;
  return {
    mode: "consensus",
    orphans,
    lsCount,
    expected,
    diverged: lsCount !== expected,
  };
}

/**
 * Label Studio should carry exactly the approved items.
 *
 * An approved item records the annotation it published, so an orphan can be
 * identified rather than inferred: any annotation no approved item claims
 * should not be there. That is stricter than the consensus check, which can
 * only compare counts per task.
 */
async function reconcileReview(
  poolId: string,
  tasks: LsTaskLite[]
): Promise<Reconciliation> {
  const [{ data: items }, { count: completionCount }] = await Promise.all([
    supabaseAdmin
      .from("review_items")
      .select("ls_task_id, state, ls_annotation_id, revision")
      .eq("pool_id", poolId),
    supabaseAdmin
      .from("task_completions")
      .select("id", { count: "exact", head: true })
      .eq("pool_id", poolId)
      .in("kind", READINGS_ONLY),
  ]);

  const rows = items ?? [];
  const approved = rows.filter((r) => r.state === "approved");
  const published = new Set(
    approved
      .map((r) => r.ls_annotation_id as number | null)
      .filter((id): id is number => typeof id === "number")
  );

  const orphans: Orphan[] = [];
  let lsCount = 0;

  for (const task of tasks) {
    for (const annotation of task.annotations ?? []) {
      lsCount += 1;
      if (!published.has(annotation.id)) {
        orphans.push({
          ls_task_id: task.id,
          annotation_id: annotation.id,
          created_at: annotation.created_at ?? null,
        });
      }
    }
  }

  return {
    mode: "review",
    orphans,
    lsCount,
    expected: approved.length,
    diverged: lsCount !== approved.length,
    work: {
      completions_total: completionCount ?? 0,
      approved_items: approved.length,
      awaiting_review: rows.filter((r) => r.state === "needs_review").length,
      awaiting_author: rows.filter((r) => r.state === "needs_author").length,
      // Every send-back bumps the revision, so the total is how many times work
      // went round again — each of which is a completion with no annotation.
      rejections: rows.reduce((n, r) => n + ((r.revision as number) ?? 0), 0),
    },
  };
}

function authorise(req: NextRequest): boolean {
  const expected = process.env.OPS_API_KEY;
  if (!expected) return false;
  const presented =
    req.headers.get("x-ops-key") ?? req.headers.get("x-delivery-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return presented === expected;
}

async function resolvePool(poolId: string) {
  const { data } = await withPoolColumns((pools) =>
    supabaseAdmin.from("pools").select(pools).eq("id", poolId).maybeSingle()
  );
  return data as unknown as (PoolRow & { id: string; name: string; ls_project_id: number }) | null;
}

/**
 * A pool on the native task store has nothing to reconcile: its answers are
 * written once, in one transaction with the work record, so there is no second
 * copy that could disagree. Said plainly rather than reported as "0 orphans",
 * which would read as a check that ran and passed.
 */
function nativeAnswer(pool: { name: string }) {
  return NextResponse.json({
    pool: pool.name,
    checked_at: new Date().toISOString(),
    mode: "native",
    applicable: false,
    reason:
      "This pool is on the native task store. Answers and work records are written in one transaction, so they cannot diverge; there is nothing to reconcile or clean up.",
  });
}

/** Reports divergence. Read-only — safe to run on a schedule. */
export async function GET(req: NextRequest) {
  if (!authorise(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const poolId = new URL(req.url).searchParams.get("poolId");
  if (!poolId) {
    return NextResponse.json(
      { error: "poolId is required." },
      { status: 400 }
    );
  }

  const pool = await resolvePool(poolId);
  if (!pool) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (poolFacts(pool).native) return nativeAnswer(pool);

  const shared = await sharedProject(pool.ls_project_id, pool.id);
  if (shared) {
    return NextResponse.json({
      pool: pool.name,
      checked_at: new Date().toISOString(),
      attributable: false,
      reason:
        `Label Studio project ${pool.ls_project_id} also backs: ${shared.join(", ")}. ` +
        "Annotations carry no pool, so divergence cannot be attributed to one pool here.",
    });
  }

  try {
    const r = await reconcile(
      pool.id,
      pool.ls_project_id,
      (pool.eval_config ?? null) as RawEvalConfig | null
    );

    return NextResponse.json({
      attributable: true,
      pool: pool.name,
      mode: r.mode,
      checked_at: new Date().toISOString(),
      ls_annotations: r.lsCount,
      // What LS is measured against. For a review pool that is the approved
      // items, not the completions — authors, reviewers and re-authored drafts
      // all produce completions, and only approval publishes.
      expected_annotations: r.expected,
      compared_against:
        r.mode === "review" ? "approved review items" : "recorded completions",
      diverged: r.diverged,
      orphans_found: r.orphans.length,
      orphans: r.orphans,
      ...(r.work ? { work: r.work } : {}),
    });
  } catch (err) {
    console.error("[reconcile] check failed", err);
    return NextResponse.json(
      { error: "Could not reach the case store." },
      { status: 502 }
    );
  }
}

/** Deletes the orphan annotations found for a pool. Destructive. */
export async function POST(req: NextRequest) {
  if (!authorise(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const url = new URL(req.url);
  const poolId = url.searchParams.get("poolId");
  if (url.searchParams.get("action") !== "cleanup") {
    return NextResponse.json(
      { error: "Pass action=cleanup to delete orphan annotations." },
      { status: 400 }
    );
  }
  if (!poolId) {
    return NextResponse.json({ error: "poolId is required." }, { status: 400 });
  }

  const pool = await resolvePool(poolId);
  if (!pool) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (poolFacts(pool).native) return nativeAnswer(pool);

  const shared = await sharedProject(pool.ls_project_id, pool.id);
  if (shared) {
    // Deleting here would destroy the other pools' annotations.
    return NextResponse.json(
      {
        error:
          `Refusing to clean up: Label Studio project ${pool.ls_project_id} also backs ${shared.join(", ")}. ` +
          "Annotations cannot be attributed to one pool, so any deletion risks another pool's work.",
      },
      { status: 409 }
    );
  }

  try {
    const { orphans } = await reconcile(
      pool.id,
      pool.ls_project_id,
      (pool.eval_config ?? null) as RawEvalConfig | null
    );
    let deleted = 0;
    const failures: number[] = [];

    for (const orphan of orphans) {
      try {
        await deleteAnnotation(orphan.annotation_id);
        deleted++;
      } catch {
        failures.push(orphan.annotation_id);
      }
    }

    return NextResponse.json({
      pool: pool.name,
      orphans_found: orphans.length,
      deleted,
      failed: failures,
    });
  } catch (err) {
    console.error("[reconcile] cleanup failed", err);
    return NextResponse.json(
      { error: "Could not reach the case store." },
      { status: 502 }
    );
  }
}
