import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { availabilityFor } from "@/lib/availability";
import { FORBIDDEN, requireEligiblePool } from "@/lib/gate";
import {
  getNativeTask,
  reserveAdjudication,
  reserveNextItem,
} from "@/lib/taskstore";
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

    // Work is held the moment it is served. The availability rule says whether there is
    // any; the reservation picks which case and keeps it for this clinician, so two
    // asking together are never sent one case and nobody reads a case they will not be
    // allowed to submit.
    //
    // A review is not reserved: an authored item is claimed through review_items, which
    // this platform owns. A held case is, but by its own rule, because it sits at its
    // reviewer ceiling by definition and the ordinary reservation would refuse it.
    let lsTaskId: number;
    if (next.kind === "held") {
      // One senior settles a case and that decision is final, so a held case goes to one
      // senior at a time. Before this, every free senior was shown the same contested
      // case and all but the first were refused at submit.
      let claim;
      try {
        claim = await reserveAdjudication({ clinicianId: auth.clinicianId, poolId: pool.id });
      } catch (err) {
        console.error(`[next] could not assign a held case in pool ${pool.id}`, err);
        return NextResponse.json(
          { error: "We could not reach the case store. Try again in a moment." },
          { status: 502 }
        );
      }
      if (claim) {
        lsTaskId = claim.taskNo;
      } else {
        // Another senior is settling it. Offer ordinary work rather than sending them
        // away from a pool that still has cases in it.
        const lease = await reserveNextItem({
          clinicianId: auth.clinicianId,
          poolId: pool.id,
        }).catch((err) => {
          console.error(`[next] could not hold a case in pool ${pool.id}`, err);
          return undefined;
        });
        if (lease === undefined) {
          return NextResponse.json(
            { error: "We could not reach the case store. Try again in a moment." },
            { status: 502 }
          );
        }
        if (!lease) return new NextResponse(null, { status: 204 });
        lsTaskId = lease.taskNo;
      }
    } else if (next.kind === "task") {
      let lease;
      try {
        lease = await reserveNextItem({ clinicianId: auth.clinicianId, poolId: pool.id });
      } catch (err) {
        console.error(`[next] could not hold a case in pool ${pool.id}`, err);
        return NextResponse.json(
          { error: "We could not reach the case store. Try again in a moment." },
          { status: 502 }
        );
      }
      // The free readings went between the count and the ask. There is work in the pool
      // and none of it is theirs to read, which is the same 204 as an empty pool.
      if (!lease) return new NextResponse(null, { status: 204 });
      lsTaskId = lease.taskNo;
    } else {
      lsTaskId = next.item.ls_task_id;
    }

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
