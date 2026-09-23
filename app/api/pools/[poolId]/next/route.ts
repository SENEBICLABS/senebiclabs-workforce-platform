import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";
import { FORBIDDEN, requireEligiblePool } from "@/lib/gate";
import { findNextTask, getTask } from "@/lib/labelstudio";
import {
  claimedTaskIds,
  itemsAwaitingReview,
  reviewRequired,
} from "@/lib/review";
import {
  buildContext,
  caseIdFor,
  normalizeConfig,
  type RawEvalConfig,
} from "@/lib/eval-config";

export const dynamic = "force-dynamic";

/**
 * The next task in a pool for this clinician.
 *
 * 403 if they are not gated into the pool, 204 once the pool is drained.
 * The response carries the task payload and the project's config — never an
 * LS id the client could act on directly, and never an LS URL or token.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  return withAuth(req, async (_req, auth) => {
    const { poolId } = await params;

    const pool = await requireEligiblePool(auth.clinicianId, poolId);
    if (!pool) return FORBIDDEN();

    const [{ data: completions }, flagged] = await Promise.all([
      supabaseAdmin
        .from("task_completions")
        .select("ls_task_id, kind")
        .eq("clinician_id", auth.clinicianId)
        .eq("pool_id", pool.id),
      loadFlaggedTaskIds(auth.clinicianId, pool.id),
    ]);

    // What not to offer again is every pass, a flag among them. What counts as
    // "reviewed" is only a reading: a case declined is not a case reviewed.
    const seen = new Set<number>(flagged);
    for (const row of completions ?? []) seen.add(row.ls_task_id);

    const readings = (completions ?? []).filter((row) =>
      READINGS_ONLY.includes(row.kind as (typeof READINGS_ONLY)[number])
    ).length;

    const raw0 = pool.evalConfig as RawEvalConfig | null;

    // Written work is authored once and approved once. Reviewing is served
    // ahead of authoring, so finished drafts do not queue up behind new ones.
    if (reviewRequired(raw0)) {
      const waiting = await itemsAwaitingReview(pool.id, auth.clinicianId);

      // Only flags hide an item from a reviewer. A completion must not: a
      // reviewer who sent work back should see the rewrite and judge whether
      // their objection was met. Their pay is deduped by the completion index,
      // not by hiding the item.
      const reviewable = waiting.find((i) => !flagged.includes(i.ls_task_id));

      if (reviewable) {
        let lsTask;
        try {
          lsTask = await getTask(reviewable.ls_task_id);
        } catch (err) {
          console.error(`[next] LS unreachable for review item`, err);
          return NextResponse.json(
            { error: "We could not reach the case store. Try again in a moment." },
            { status: 502 }
          );
        }

        const cfg = normalizeConfig(raw0);
        const d = (lsTask.data ?? {}) as Record<string, unknown>;
        return NextResponse.json({
          phase: "review",
          task_id: reviewable.ls_task_id,
          pool: { id: pool.id, name: pool.name, purpose: cfg.purpose },
          case_id: caseIdFor(raw0, d),
          context: buildContext(raw0, d),
          eval_config: {
            instructions: cfg.instructions,
            fields: cfg.fields,
            classes: cfg.classes,
          },
          // What the author wrote. No identity — a reviewer judges the text.
          authored: reviewable.authored_data,
          revision: reviewable.revision,
          already_reviewed_count: readings,
        });
      }

      // Nothing to review: author something nobody has claimed.
      for (const id of await claimedTaskIds(pool.id)) seen.add(id);
    }

    let task;
    try {
      task = await findNextTask(pool.lsProjectId, seen, pool.maxAnnotations);
    } catch (err) {
      console.error(`[next] LS unreachable for pool ${pool.id}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502 }
      );
    }

    if (!task) return new NextResponse(null, { status: 204 });

    const raw = raw0;
    const config = normalizeConfig(raw);
    const data = (task.data ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      phase: reviewRequired(raw0) ? "author" : "single",
      task_id: task.id,
      pool: { id: pool.id, name: pool.name, purpose: config.purpose },
      case_id: caseIdFor(raw, data),
      context: buildContext(raw, data),
      eval_config: {
        instructions: config.instructions,
        fields: config.fields,
        classes: config.classes,
      },
      already_reviewed_count: readings,
    });
  });
}

/** Flags are optional infrastructure; a missing table must not break serving. */
async function loadFlaggedTaskIds(
  clinicianId: string,
  poolId: string
): Promise<number[]> {
  const { data, error } = await supabaseAdmin
    .from("task_flags")
    .select("ls_task_id")
    .eq("clinician_id", clinicianId)
    .eq("pool_id", poolId);

  if (error) return [];
  return (data ?? []).map((row) => row.ls_task_id as number);
}
