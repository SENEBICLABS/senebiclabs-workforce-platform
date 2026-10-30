import { after, NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import {
  FORBIDDEN,
  POOL_CLOSED,
  requireEligiblePoolForTask,
  type GatedPool,
} from "@/lib/gate";
import {
  getNativeTask,
  reserveNextItem,
  settleReservation,
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
 * A judgement is one database call that writes the answer, the completion and
 * the event HEALTH scores from, together or not at all.
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
    let pool: GatedPool | null;
    try {
      pool = (await requireEligiblePoolForTask(auth.clinicianId, taskId))?.pool ?? null;
    } catch (err) {
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
    // Nothing is written to the task store. A third answer would be read back
    // as a third reading and re-open the very disagreement this settles, so the
    // decision goes to HEALTH as the case's final answer instead.
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
    // second clinician approves it, so an unapproved answer never reaches the
    // task store and never reaches whatever consumes that project's webhook.
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

    return recordJudgement(auth.clinicianId, pool, taskId, result, answers, raw);
  });
}

/** What each outcome of a judgement means to the clinician. */
const REFUSALS: Record<Exclude<SubmitOutcome, "claimed" | "not_found" | "closed">, [number, string]> = {
  already: [409, "You have already reviewed this case."],
  full: [409, "This case has already been reviewed by enough clinicians. Nothing was lost — the next case is ready."],
  settled: [409, "This case has already been settled by a senior clinician."],
  unavailable: [409, "This case is not open for review yet. The next case is ready."],
  wrong_phase: [409, "This pool asks for written work. Reload to continue."],
  invalid: [422, "Complete at least one field before submitting."],
};

async function recordJudgement(
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
      `[submit] task store write failed for task ${taskNo}`,
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
    const [status, error] = REFUSALS[outcome];
    return NextResponse.json({ error }, { status });
  }

  // Scoring happens in HEALTH. The answer and its event are already committed,
  // so this is only a nudge, sent after the response so the clinician's next
  // case does not wait on it. The hold is tidied in the same breath: the ceiling never
  // depended on it, because a hold whose owner has answered already stopped counting.
  after(async () => {
    await settleReservation(clinicianId, taskNo);
    notifyAnswersRecorded();
  });

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
    // Held before it is shown, like every other way a case reaches a clinician. This is
    // the path that matters most: someone who is working draws nearly every case through
    // it rather than through /next, so reserving only there would leave the collision
    // exactly where the work happens.
    //
    // `seen` is no longer consulted because the database applies the same exclusions this
    // branch used to apply by hand: answered, passed, flagged, already held, at its
    // ceiling. There was one copy of that rule too many.
    const lease = await reserveNextItem({ clinicianId, poolId: pool.id });
    const task = lease ? await getNativeTask(lease.taskNo) : null;
    if (!task) return null;
    taskId = task.id;
    data = task.data;
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
    // No + 1 here. This runs after the judgement has inserted the completion,
    // so the row just written is already in this count; adding one made the
    // number the clinician sees jump by two on their first submit and stay one
    // too high for the rest of the sitting, correcting itself only on a reload.
    already_reviewed_count: readings,
  };
}
