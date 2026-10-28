import { after, NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { recordPass } from "@/lib/completions";
import {
  FORBIDDEN,
  POOL_CLOSED,
  requireEligiblePoolForTask,
  type GatedPool,
} from "@/lib/gate";
import { approveReview, TaskStoreError } from "@/lib/taskstore";
import { notifyAnswersRecorded } from "@/lib/health";
import {
  answersToLsResult,
  normalizeConfig,
  TranslationError,
  type RawEvalConfig,
} from "@/lib/eval-config";
import { loadItem, recordRejected, reviewRequired } from "@/lib/review";

export const dynamic = "force-dynamic";

/**
 * Records the reviewer's pass as work done.
 *
 * Called for every outcome, approve and send-back alike. Paying only for
 * approvals would pay reviewers to approve, which is the one thing a review
 * pass must not reward. The unique index on (clinician_id, ls_task_id, kind)
 * means a reviewer who sends an item back and later approves the rewrite is
 * recorded once, not twice.
 */
async function recordReviewerWork(
  clinicianId: string,
  poolId: string,
  taskId: number,
  data: unknown
): Promise<void> {
  // A duplicate is the same reviewer's earlier pass on this task, which is
  // exactly the case the unique index exists for: sending a draft back and
  // later approving the rewrite is one reviewer's work on one case, and is
  // recorded once. Scoping that index by kind does not change it, because both
  // passes are of kind "review".
  await recordPass({ clinicianId, poolId, taskId, kind: "review", data });
}

/**
 * The approval pass on written work.
 *
 * Three outcomes: approve the text as written, edit it and approve the edit, or
 * send it back with a reason. Approving is what publishes: the answer of record
 * is written here, so the task store holds approved prose and nothing else.
 *
 * One approver is enough. Prose cannot be majority-voted, and the delivered
 * value is one clinician's words, never a merge of two.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  return withAuth(req, async (request, auth) => {
    const taskId = Number((await params).taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "Unknown task." }, { status: 400 });
    }

    let action: string;
    let answers: Record<string, unknown> | undefined;
    let reason: string;
    try {
      const body = await request.json();
      action = String(body?.action ?? "");
      answers = body?.answers;
      reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    } catch {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }

    if (!["approve", "edit", "reject"].includes(action)) {
      return NextResponse.json(
        { error: "Choose approve, edit, or reject." },
        { status: 400 }
      );
    }

    let pool: GatedPool | null;
    try {
      pool = (await requireEligiblePoolForTask(auth.clinicianId, taskId))?.pool ?? null;
    } catch (err) {
      console.error(`[review] case store unreachable resolving task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502 }
      );
    }
    if (!pool) return FORBIDDEN();
    if (pool.closedAt) return POOL_CLOSED();

    const raw = pool.evalConfig as RawEvalConfig | null;
    if (!reviewRequired(raw)) {
      return NextResponse.json(
        { error: "This pool does not use review." },
        { status: 400 }
      );
    }

    const item = await loadItem(pool.id, taskId);
    if (!item || item.state !== "needs_review") {
      return NextResponse.json(
        { error: "This case is not waiting for review." },
        { status: 409 }
      );
    }

    // The rule that makes review worth anything: nobody approves their own
    // writing. Enforced here as well as in serving, so a hand-made request
    // cannot do what the queue would never offer.
    if (item.author_id === auth.clinicianId) {
      return NextResponse.json(
        { error: "You wrote this one, so you cannot review it." },
        { status: 403 }
      );
    }

    /* ---- send it back ------------------------------------------------ */
    if (action === "reject") {
      if (reason.length < 3) {
        return NextResponse.json(
          { error: "Say briefly what needs to change, and why." },
          { status: 422 }
        );
      }
      const done = await recordRejected(item, auth.clinicianId, reason.slice(0, 1000));
      if (!done) {
        return NextResponse.json(
          { error: "This case was already reviewed." },
          { status: 409 }
        );
      }
      await recordReviewerWork(auth.clinicianId, pool.id, taskId, {
        review_action: "rejected",
        reason: reason.slice(0, 1000),
        revision: item.revision + 1,
      });

      return NextResponse.json({
        reviewed: true,
        action: "rejected",
        state: "needs_author",
        revision: item.revision + 1,
      });
    }

    /* ---- approve, as written or as edited ---------------------------- */
    const finalData =
      action === "edit"
        ? { ...(item.authored_data ?? {}), ...(answers ?? {}) }
        : (item.authored_data ?? {});

    if (action === "edit" && (!answers || Object.keys(answers).length === 0)) {
      return NextResponse.json(
        { error: "No edits were sent." },
        { status: 400 }
      );
    }

    const config = normalizeConfig(raw);
    let result;
    try {
      result = answersToLsResult(config, finalData);
    } catch (err) {
      if (err instanceof TranslationError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }

    // Publishing, approving, recording the reviewer's pass and the event for
    // HEALTH are one transaction, and the database re-checks that the reader is
    // not the author.
    let outcome;
    try {
      outcome = await approveReview({
        reviewItemId: item.id,
        reviewerId: auth.clinicianId,
        action: action === "edit" ? "edited" : "approved",
        finalData,
        result,
      });
    } catch (err) {
      console.error(
        `[review] task store write failed for task ${taskId}`,
        err instanceof TaskStoreError ? err.message : err
      );
      return NextResponse.json(
        { error: "We could not publish this approval. Your decision is not lost — try again." },
        { status: 500 }
      );
    }
    if (outcome === "not_found") return FORBIDDEN();
    if (outcome === "closed") return POOL_CLOSED();
    if (outcome === "own_work") {
      return NextResponse.json(
        { error: "You wrote this one, so you cannot review it." },
        { status: 403 }
      );
    }
    if (outcome !== "approved") {
      return NextResponse.json({ error: "This case was already reviewed." }, { status: 409 });
    }
    after(() => notifyAnswersRecorded());
    return NextResponse.json({
      reviewed: true,
      action: action === "edit" ? "edited" : "approved",
      state: "approved",
      final: finalData,
    });
  });
}
