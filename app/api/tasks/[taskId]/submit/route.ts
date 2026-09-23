import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { FORBIDDEN, requireEligiblePoolForTask } from "@/lib/gate";
import {
  createAnnotation,
  deleteAnnotation,
  getTask,
  LabelStudioError,
  findNextTask,
} from "@/lib/labelstudio";
import {
  answersToLsResult,
  buildContext,
  caseIdFor,
  normalizeConfig,
  TranslationError,
  type RawEvalConfig,
} from "@/lib/eval-config";
import { recordAuthored, reviewRequired } from "@/lib/review";

export const dynamic = "force-dynamic";

/**
 * Records one completed review.
 *
 * The body is a plain { fieldname: value } map — the client knows nothing of
 * Label Studio's shapes. The order here matters: write to LS first, then record
 * the completion. If the LS write fails the request fails and the clinician
 * keeps their answers; if the completion insert fails afterwards, the LS
 * annotation is rolled back so the two never diverge.
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

    let answers: Record<string, unknown>;
    try {
      const body = await request.json();
      answers = body?.answers;
      if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
        return NextResponse.json(
          { error: "No answers were sent." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }

    // The task must belong to a project backing a pool this clinician holds.
    // A store that is merely unreachable must not be reported as a refusal:
    // "not eligible" reads as permanent, and the clinician would stop retrying.
    let lsTask;
    try {
      lsTask = await getTask(taskId);
    } catch (err) {
      if (err instanceof LabelStudioError && err.status === 404) {
        return FORBIDDEN();
      }
      console.error(`[submit] LS unreachable resolving task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Your answers are still here — try again in a moment." },
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

    // Idempotency: the unique index on (clinician_id, ls_task_id) is the real
    // guard, this just turns a double-submit into a clean answer.
    const { data: existing } = await supabaseAdmin
      .from("task_completions")
      .select("id")
      .eq("clinician_id", auth.clinicianId)
      .eq("ls_task_id", taskId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "You have already reviewed this case." },
        { status: 409 }
      );
    }

    const raw = pool.evalConfig as RawEvalConfig | null;
    const config = normalizeConfig(raw);

    let result;
    try {
      result = answersToLsResult(config, answers);
    } catch (err) {
      if (err instanceof TranslationError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Complete at least one field before submitting." },
        { status: 422 }
      );
    }

    // Written work is not published on submission. The draft is held until a
    // second clinician approves it, so an unapproved answer never reaches Label
    // Studio and never reaches whatever consumes that project's webhook.
    if (reviewRequired(raw)) {
      const claimed = await recordAuthored(
        pool.id,
        taskId,
        auth.clinicianId,
        answers
      );

      if (!claimed.ok) {
        return NextResponse.json(
          {
            error:
              "Another clinician has already written this one. The next case is ready.",
          },
          { status: 409 }
        );
      }

      // Authoring is paid work and counts toward the author's totals, even
      // though nothing is published until someone approves it. This is why a
      // review pool holds more completions than annotations.
      const { error: authorCompletion } = await supabaseAdmin
        .from("task_completions")
        .insert({
          clinician_id: auth.clinicianId,
          pool_id: pool.id,
          ls_task_id: taskId,
          annotation_data: answers,
        });

      // 23505 means they already have a completion on this task — a re-author
      // after a send-back. The work happened; one row for it is enough.
      if (authorCompletion && authorCompletion.code !== "23505") {
        console.error("[submit] author completion insert failed", authorCompletion);
      }

      return NextResponse.json({
        recorded: true,
        phase: "author",
        state: claimed.item.state,
        awaiting_review: true,
        next: await nextTaskFor(auth.clinicianId, pool, raw),
      });
    }

    // The overlap ceiling was last checked when this task was served, which may
    // have been minutes ago and before other clinicians submitted. Re-check it
    // against the task we just fetched: the client commissioned a fixed number
    // of reviews per case and must not be billed for more.
    if (
      pool.maxAnnotations !== null &&
      (lsTask.total_annotations ?? 0) >= pool.maxAnnotations
    ) {
      return NextResponse.json(
        {
          error:
            "This case has already been reviewed by enough clinicians. Nothing was lost — the next case is ready.",
        },
        { status: 409 }
      );
    }

    // 1. Write to LS.
    let annotationId: number;
    try {
      annotationId = await createAnnotation(taskId, result);
    } catch (err) {
      console.error(`[submit] LS write failed for task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not save your review. Your answers are still here." },
        { status: 502 }
      );
    }

    // 2. Record the completion. On failure, undo the LS write.
    //
    // claim_task_slot (migration 002) counts and inserts under a row lock, so
    // concurrent clinicians cannot each pass the ceiling check and overshoot the
    // reviews the client commissioned. Where the function is not yet installed
    // this falls back to a plain insert, which is idempotent but can overshoot.
    const claim = await supabaseAdmin.rpc("claim_task_slot", {
      p_clinician_id: auth.clinicianId,
      p_pool_id: pool.id,
      p_ls_task_id: taskId,
      p_annotation_data: result,
    });

    let insertError = claim.error;

    // Which path decided this submit — atomic claim, or the degraded fallback.
    console.log(
      `[submit] task ${taskId} claim_task_slot → ${
        claim.error ? `error ${claim.error.code}` : claim.data
      }`
    );

    if (claim.error) {
      const missing =
        claim.error.code === "PGRST202" ||
        /claim_task_slot/i.test(claim.error.message ?? "");
      if (missing) {
        console.warn(
          "[submit] claim_task_slot missing — run migration 002; overlap is not atomic"
        );
        const fallback = await supabaseAdmin.from("task_completions").insert({
          clinician_id: auth.clinicianId,
          pool_id: pool.id,
          ls_task_id: taskId,
          annotation_data: result,
        });
        insertError = fallback.error;
      }
    } else if (claim.data === "full" || claim.data === "already") {
      // Someone else took the slot between serving and submitting; the
      // annotation we just wrote has to come back out.
      try {
        await deleteAnnotation(annotationId);
      } catch (rollbackError) {
        console.error(
          `[submit] ORPHAN annotation ${annotationId} on task ${taskId}`,
          rollbackError
        );
      }
      return NextResponse.json(
        {
          error:
            claim.data === "already"
              ? "You have already reviewed this case."
              : "This case has already been reviewed by enough clinicians. Nothing was lost — the next case is ready.",
        },
        { status: 409 }
      );
    }

    if (insertError) {
      // The annotation is already in LS, so it must come back out — including
      // on 23505. That code means a concurrent request won the race and has
      // already recorded this completion, which makes ours the duplicate.
      try {
        await deleteAnnotation(annotationId);
      } catch (rollbackError) {
        // Left for the reconcile endpoint to sweep up.
        console.error(
          `[submit] ORPHAN annotation ${annotationId} on task ${taskId}`,
          rollbackError
        );
      }

      if (insertError.code === "23505") {
        return NextResponse.json(
          { error: "You have already reviewed this case." },
          { status: 409 }
        );
      }

      console.error(`[submit] completion insert failed for ${taskId}`, insertError);
      return NextResponse.json(
        { error: "We could not save your review. Your answers are still here." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      recorded: true,
      next: await nextTaskFor(auth.clinicianId, pool, raw),
    });
  });
}

async function nextTaskFor(
  clinicianId: string,
  pool: { id: string; name: string; lsProjectId: number; maxAnnotations: number | null },
  raw: RawEvalConfig | null
) {
  const [{ data: completions }, { data: flags }] = await Promise.all([
    supabaseAdmin
      .from("task_completions")
      .select("ls_task_id")
      .eq("clinician_id", clinicianId)
      .eq("pool_id", pool.id),
    supabaseAdmin
      .from("task_flags")
      .select("ls_task_id")
      .eq("clinician_id", clinicianId)
      .eq("pool_id", pool.id),
  ]);

  const seen = new Set<number>();
  for (const row of completions ?? []) seen.add(row.ls_task_id);
  for (const row of flags ?? []) seen.add(row.ls_task_id as number);

  let task;
  try {
    task = await findNextTask(pool.lsProjectId, seen, pool.maxAnnotations);
  } catch {
    return null;
  }

  if (!task) return null;

  const config = normalizeConfig(raw);
  const data = (task.data ?? {}) as Record<string, unknown>;

  return {
    task_id: task.id,
    pool: { id: pool.id, name: pool.name, purpose: config.purpose },
    case_id: caseIdFor(raw, data),
    context: buildContext(raw, data),
    eval_config: {
      instructions: config.instructions,
      fields: config.fields,
      classes: config.classes,
    },
    // No + 1 here. This runs after claim_task_slot has inserted the completion,
    // so the row just written is already in this count; adding one made the
    // number the clinician sees jump by two on their first submit and stay one
    // too high for the rest of the sitting, correcting itself only on a reload.
    already_reviewed_count: completions?.length ?? 0,
  };
}
