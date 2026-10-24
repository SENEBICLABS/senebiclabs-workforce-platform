import { after, NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FORBIDDEN,
  POOL_CLOSED,
  requireEligiblePoolForNativeTask,
  requireEligiblePoolForTask,
  type GatedPool,
} from "@/lib/gate";
import {
  createAnnotation,
  deleteAnnotation,
  getTask,
  LabelStudioError,
  findNextTask,
  selectNextTask,
} from "@/lib/labelstudio";
import {
  getNativeTask,
  isNativeTaskId,
  nativeTaskStates,
  submitJudgement,
  TaskStoreError,
  type SubmitOutcome,
} from "@/lib/taskstore";
import {
  answersToLsResult,
  buildContext,
  caseIdFor,
  normalizeConfig,
  TranslationError,
  type RawEvalConfig,
} from "@/lib/eval-config";
import { recordAuthored, reviewRequired } from "@/lib/review";
import { READINGS_ONLY, recordPass } from "@/lib/completions";
import { adjudicate, forgetHeld, heldCases, notifyAnswersRecorded } from "@/lib/health";
import { summariseDecision } from "@/lib/adjudication";

export const dynamic = "force-dynamic";

/**
 * Records one completed review.
 *
 * The body is a plain { fieldname: value } map — the client knows nothing of
 * the stored shapes.
 *
 * Two stores. On the native task store a judgement is one database call that
 * writes the answer, the completion and the event HEALTH scores from, together
 * or not at all. On Label Studio the order matters: write to LS first, then
 * record the completion. If the LS write fails the request fails and the
 * clinician keeps their answers; if the completion insert fails afterwards, the
 * LS annotation is rolled back so the two never diverge.
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
    const native = isNativeTaskId(taskId);
    let pool: GatedPool | null;
    let lsTotalAnnotations = 0;
    try {
      if (native) {
        pool = (await requireEligiblePoolForNativeTask(auth.clinicianId, taskId))?.pool ?? null;
      } else {
        const lsTask = await getTask(taskId);
        lsTotalAnnotations = lsTask.total_annotations ?? 0;
        pool = await requireEligiblePoolForTask(
          auth.clinicianId,
          taskId,
          Number((lsTask as unknown as { project?: number }).project)
        );
      }
    } catch (err) {
      if (err instanceof LabelStudioError && err.status === 404) {
        return FORBIDDEN();
      }
      console.error(`[submit] case store unreachable resolving task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Your answers are still here — try again in a moment." },
        { status: 502 }
      );
    }

    if (!pool) return FORBIDDEN();
    if (pool.closedAt) return POOL_CLOSED();

    const raw = pool.evalConfig as RawEvalConfig | null;
    const config = normalizeConfig(raw);

    // Which pass is this? A pool that wants a second reading is being authored;
    // anything else is being judged.
    const passKind = reviewRequired(raw) ? "authoring" : "judgement";

    // Idempotency: the unique index on (clinician_id, ls_task_id, kind) is the
    // real guard, this just turns a double-submit into a clean answer. It has
    // to filter on the kind now, because a clinician may hold a flag row for
    // this same case, and a flag is not a submitted review. Without the filter
    // a flagged case would answer "you have already reviewed this" to someone
    // who never judged it.
    const [{ data: existing }, { data: alreadySettled }] = await Promise.all([
      supabaseAdmin
        .from("task_completions")
        .select("id")
        .eq("clinician_id", auth.clinicianId)
        .eq("ls_task_id", taskId)
        .eq("kind", passKind)
        .maybeSingle(),
      // Has a senior already settled this case?
      //
      // Once they have, no further answer belongs on it from anyone. Without
      // this the senior who settled it could submit again, find the case no
      // longer held — they had just removed it from the held list — and fall
      // through to the ordinary path, writing the third annotation the whole
      // design exists to avoid. A late submission from either original reader
      // would do the same.
      supabaseAdmin
        .from("task_completions")
        .select("id")
        .eq("ls_task_id", taskId)
        .eq("kind", "adjudication")
        .maybeSingle(),
    ]);

    if (alreadySettled) {
      return NextResponse.json(
        { error: "This case has already been settled by a senior clinician." },
        { status: 409 }
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: "You have already reviewed this case." },
        { status: 409 }
      );
    }

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

    // A senior settling a disagreement.
    //
    // Whether this is an adjudication is decided here, not by the client: they
    // are senior for this pool and HEALTH is holding this case. A client saying
    // so would be a way to write a final answer over two readings it disagreed
    // with, so the claim is re-derived from the same two sources the queue used
    // to offer it.
    //
    // Nothing is written to Label Studio. A third annotation would be pulled
    // back as a third reading and re-open the very disagreement this settles,
    // so the decision goes to HEALTH as the case's final answer instead.
    //
    // The senior was never shown the earlier readings. They judged the case as
    // their own work, and the comparison below happens after the fact, so a
    // third independent judgement is what HEALTH receives rather than a
    // refereed one.
    if (pool.senior) {
      const held = await heldCases(pool);
      const thisCase = held.find((c) => c.ls_task_id === taskId);

      if (thisCase) {
        // The row first, HEALTH second. The unique index allows one
        // adjudication per case, so two seniors submitting together resolve
        // here: the loser is told, before either has told HEALTH anything. The
        // cost of this order is that a failed call can leave a row with no
        // decision behind it, which is why the row is removed when that
        // happens — the opposite order could leave a case decided twice.
        const claimed = await recordPass({
          clinicianId: auth.clinicianId,
          poolId: pool.id,
          taskId,
          kind: "adjudication",
          data: answers,
        });

        if (claimed.duplicate) {
          return NextResponse.json(
            { error: "Another senior clinician has already settled this case." },
            { status: 409 }
          );
        }
        if (!claimed.ok) {
          return NextResponse.json(
            { error: "We could not record your decision. Your answers are still here." },
            { status: 500 }
          );
        }

        // Compared here, never rendered. Whether their answer happened to
        // match an earlier one changes nothing about the outcome — their
        // answer is final either way — but it is the difference between "two
        // of three agreed" and "all three differed", and those are the facts
        // that keep the agreement figures worth reading.
        const decision = summariseDecision({
          config,
          raw,
          answers,
          earlier: thisCase.earlier_answers ?? [],
        });

        // Their own reasoning rides along with it, from the written field they
        // have already filled in rather than a second box asking again.
        const written = config.fields.find((f) => f.type === "text");
        const reasoning = written ? String(answers[written.name] ?? "").trim() : "";
        const note = reasoning ? `${decision.note}\n\n${reasoning}` : decision.note;

        try {
          await adjudicate({
            project_id: thisCase.project_id,
            idx: thisCase.idx,
            final_label: answers,
            note,
            decided_by: `${auth.email} (clinician ${auth.clinicianId})`,
          });
        } catch (err) {
          console.error(`[submit] HEALTH refused the adjudication for task ${taskId}`, err);
          // Undo the claim, or this senior is recorded for a decision nobody
          // received and the case stays held with no way back in.
          await supabaseAdmin
            .from("task_completions")
            .delete()
            .eq("clinician_id", auth.clinicianId)
            .eq("ls_task_id", taskId)
            .eq("kind", "adjudication");

          return NextResponse.json(
            { error: "We could not record your decision just now. Your answers are still here — try again in a moment." },
            { status: 502 }
          );
        }

        // Settled: stop offering it to the next senior who asks.
        forgetHeld(pool);

        // Answered as an ordinary submission would be. The senior need not
        // know this case was contested, and nothing here tells them.
        return NextResponse.json({
          recorded: true,
          next: await nextTaskFor(auth.clinicianId, pool, raw),
        });
      }
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
      const authored = await recordPass({
        clinicianId: auth.clinicianId,
        poolId: pool.id,
        taskId,
        kind: "authoring",
        data: answers,
      });

      // A duplicate is a re-author after a send-back. The work happened; one
      // row for it is enough.
      if (!authored.ok) {
        console.error(`[submit] the authoring pass on task ${taskId} was not recorded`);
      }

      return NextResponse.json({
        recorded: true,
        phase: "author",
        state: claimed.item.state,
        awaiting_review: true,
        next: await nextTaskFor(auth.clinicianId, pool, raw),
      });
    }

    if (native) {
      return recordNativeJudgement(auth.clinicianId, pool, taskId, result, answers, raw);
    }

    // The overlap ceiling was last checked when this task was served, which may
    // have been minutes ago and before other clinicians submitted. Re-check it
    // against the task we just fetched: the client commissioned a fixed number
    // of reviews per case and must not be billed for more.
    if (
      pool.maxAnnotations !== null &&
      lsTotalAnnotations >= pool.maxAnnotations
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
          kind: "judgement",
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

/**
 * What each outcome of a native judgement means to the clinician. The wording
 * matches the Label Studio path's, so the store is invisible to them.
 */
const NATIVE_REFUSALS: Record<Exclude<SubmitOutcome, "claimed" | "not_found" | "closed">, [number, string]> = {
  already: [409, "You have already reviewed this case."],
  full: [409, "This case has already been reviewed by enough clinicians. Nothing was lost — the next case is ready."],
  settled: [409, "This case has already been settled by a senior clinician."],
  unavailable: [409, "This case is not open for review yet. The next case is ready."],
  wrong_phase: [409, "This pool asks for written work. Reload to continue."],
  invalid: [422, "Complete at least one field before submitting."],
};

async function recordNativeJudgement(
  clinicianId: string,
  pool: GatedPool,
  taskNo: number,
  result: ReturnType<typeof answersToLsResult>,
  answers: Record<string, unknown>,
  raw: RawEvalConfig | null
) {
  let outcome: SubmitOutcome;
  try {
    outcome = await submitJudgement({ clinicianId, poolId: pool.id, taskNo, result, answers });
  } catch (err) {
    console.error(
      `[submit] native store write failed for task ${taskNo}`,
      err instanceof TaskStoreError ? err.message : err
    );
    return NextResponse.json(
      { error: "We could not save your review. Your answers are still here." },
      { status: 500 }
    );
  }

  if (outcome === "not_found") return FORBIDDEN();
  if (outcome === "closed") return POOL_CLOSED();
  if (outcome !== "claimed") {
    const [status, error] = NATIVE_REFUSALS[outcome];
    return NextResponse.json({ error }, { status });
  }

  // Scoring happens in HEALTH. The answer and its event are already committed,
  // so this is only a nudge, sent after the response so the clinician's next
  // case does not wait on it.
  after(() => notifyAnswersRecorded());

  return NextResponse.json({
    recorded: true,
    next: await nextTaskFor(clinicianId, pool, raw),
  });
}

async function nextTaskFor(
  clinicianId: string,
  pool: GatedPool,
  raw: RawEvalConfig | null
) {
  const [{ data: completions }, { data: flags }] = await Promise.all([
    supabaseAdmin
      .from("task_completions")
      .select("ls_task_id, kind")
      .eq("clinician_id", clinicianId)
      .eq("pool_id", pool.id),
    supabaseAdmin
      .from("task_flags")
      .select("ls_task_id")
      .eq("clinician_id", clinicianId)
      .eq("pool_id", pool.id),
  ]);

  // Two different questions of the same rows. What not to offer again includes
  // every kind of pass, a flag among them. What to show as "reviewed" counts
  // only readings, because a case someone declined to judge is not one they
  // reviewed.
  const seen = new Set<number>();
  for (const row of completions ?? []) seen.add(row.ls_task_id);
  for (const row of flags ?? []) seen.add(row.ls_task_id as number);

  const readings = (completions ?? []).filter((row) =>
    READINGS_ONLY.includes(row.kind as (typeof READINGS_ONLY)[number])
  ).length;

  let taskId: number;
  let data: Record<string, unknown>;
  try {
    if (pool.native && pool.projectId) {
      const states = await nativeTaskStates(pool.projectId);
      const pick = selectNextTask(
        states.map((s) => ({ ...s, data: {} })),
        seen,
        pool.maxAnnotations
      );
      const task = pick ? await getNativeTask(pick.id) : null;
      if (!task) return null;
      taskId = task.id;
      data = task.data;
    } else {
      const task = await findNextTask(pool.lsProjectId, seen, pool.maxAnnotations);
      if (!task) return null;
      taskId = task.id;
      data = (task.data ?? {}) as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  const config = normalizeConfig(raw);

  return {
    task_id: taskId,
    pool: { id: pool.id, name: pool.name, purpose: config.purpose },
    case_id: caseIdFor(raw, data),
    context: buildContext(raw, data, taskId),
    eval_config: {
      instructions: config.instructions,
      fields: config.fields,
      classes: config.classes,
    },
    // No + 1 here. This runs after claim_task_slot has inserted the completion,
    // so the row just written is already in this count; adding one made the
    // number the clinician sees jump by two on their first submit and stay one
    // too high for the rest of the sitting, correcting itself only on a reload.
    already_reviewed_count: readings,
  };
}
