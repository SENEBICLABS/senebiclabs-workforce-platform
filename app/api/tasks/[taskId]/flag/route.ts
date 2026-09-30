import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { FORBIDDEN, POOL_CLOSED, requireEligiblePoolForTask } from "@/lib/gate";
import { getTask, LabelStudioError } from "@/lib/labelstudio";
import { recordPass } from "@/lib/completions";

export const dynamic = "force-dynamic";

/**
 * Skips a case without writing an annotation.
 *
 * Flagging is the escape hatch for a case a clinician cannot judge — it must
 * never produce a guess in Label Studio, so nothing is written there.
 *
 * Two rows, for two different purposes. task_flags is the routing fact: do not
 * serve this case to this clinician again. task_completions is the record of
 * work: they read the case and made a judgement about their own competence to
 * judge it, which is a pass, and is the pass most easily lost. Until this was
 * added, flagging left no trace of work at all, so whenever pay is built from
 * this table, an honest flag would have been worth nothing.
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

    let reason = "";
    try {
      const body = await request.json().catch(() => ({}));
      reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "";
    } catch {
      reason = "";
    }

    let lsTask;
    try {
      lsTask = await getTask(taskId);
    } catch (err) {
      if (err instanceof LabelStudioError && err.status === 404) {
        return FORBIDDEN();
      }
      console.error(`[flag] LS unreachable resolving task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502 }
      );
    }

    const projectId = Number(
      (lsTask as unknown as { project?: number }).project
    );
    const pool = await requireEligiblePoolForTask(
      auth.clinicianId,
      taskId,
      projectId
    );
    if (!pool) return FORBIDDEN();
    if (pool.closedAt) return POOL_CLOSED();

    const { error } = await supabaseAdmin.from("task_flags").insert({
      clinician_id: auth.clinicianId,
      pool_id: pool.id,
      ls_task_id: taskId,
      reason,
    });

    // 23505 = already flagged; that is the desired end state either way.
    if (error && error.code !== "23505") {
      console.error(`[flag] insert failed for task ${taskId}`, error);
      return NextResponse.json(
        { error: "We could not record that flag. Try again." },
        { status: 500 }
      );
    }

    // The routing fact is recorded; now the work. A failure here is logged and
    // not surfaced: the flag itself succeeded, the case has moved on, and
    // telling the clinician to try again would re-flag something already
    // flagged. The log is what tells us a pass went unrecorded.
    const recorded = await recordPass({
      clinicianId: auth.clinicianId,
      poolId: pool.id,
      taskId,
      kind: "flag",
      data: reason ? { reason } : null,
    });

    if (!recorded.ok) {
      console.error(
        `[flag] task ${taskId} was flagged but the pass was not recorded for ${auth.clinicianId}`
      );
    }

    return NextResponse.json({ flagged: true });
  });
}
