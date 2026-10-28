import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { availabilityFor } from "@/lib/availability";
import { FORBIDDEN, requireEligiblePool } from "@/lib/gate";
import { getNativeTask } from "@/lib/taskstore";
import { reviewRequired } from "@/lib/review";
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
 * 403 if they are not gated into the pool, 204 once there is nothing left for
 * them. The response carries the task payload and the project's config, and
 * nothing the client could use to reach the database directly.
 *
 * What to serve is not decided here. lib/availability decides it, and the pool
 * list reads the same decision to say how many cases are waiting, so a card
 * offering work always has work behind it. This route's job is to take that
 * answer, fetch the case, and shape it for the client.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  return withAuth(req, async (_req, auth) => {
    const { poolId } = await params;

    const pool = await requireEligiblePool(auth.clinicianId, poolId);
    if (!pool) return FORBIDDEN();

    const state = await availabilityFor(pool, auth.clinicianId);

    // "We could not read the pool" and "the pool is finished" look identical
    // from here and mean opposite things to a clinician, so they are never
    // collapsed into the same 204.
    if (state.degraded) {
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502 }
      );
    }

    // A closed pool serves nothing, whatever is left in it. An operator marks a
    // pool closed when its project has gone downstream, and work done after
    // that point is work nobody asked for.
    if (state.closed || !state.next) return new NextResponse(null, { status: 204 });

    const raw = pool.evalConfig as RawEvalConfig | null;
    const config = normalizeConfig(raw);
    const next = state.next;

    const lsTaskId =
      next.kind === "review" ? next.item.ls_task_id : next.lsTaskId;

    let data: Record<string, unknown>;
    try {
      const task = await getNativeTask(lsTaskId);
      if (!task || task.projectId !== pool.projectId) {
        // The availability rule offered a task this pool does not own. Serve
        // nothing rather than another project's case.
        console.error(`[next] task ${lsTaskId} is not in pool ${pool.id}'s project`);
        return new NextResponse(null, { status: 204 });
      }
      data = task.data;
    } catch (err) {
      console.error(`[next] case store unreachable for task ${lsTaskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502 }
      );
    }

    const common = {
      task_id: lsTaskId,
      pool: { id: pool.id, name: pool.name, purpose: config.purpose },
      case_id: caseIdFor(raw, data),
      context: buildContext(raw, data, lsTaskId),
      eval_config: {
        instructions: config.instructions,
        fields: config.fields,
        classes: config.classes,
      },
      already_reviewed_count: state.completed,
    };

    if (next.kind === "review") {
      return NextResponse.json({
        ...common,
        phase: "review",
        // What the author wrote. No identity — a reviewer judges the text.
        authored: next.item.authored_data,
        revision: next.item.revision,
      });
    }

    // A held case is served as an ordinary case, because that is what it should
    // look like. A senior who knows a case was contested is no longer an
    // independent third reader of it, and the earlier answers are the strongest
    // possible hint: shown them, they would be refereeing a disagreement rather
    // than judging a case. So the payload carries nothing the ordinary one does
    // not, and the comparison waits until they have submitted.
    return NextResponse.json({
      ...common,
      phase: reviewRequired(raw) ? "author" : "single",
    });
  });
}
