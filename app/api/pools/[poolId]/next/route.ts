import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";
import { FORBIDDEN, requireEligiblePool } from "@/lib/gate";
import { findNextTask, getTask } from "@/lib/labelstudio";
import { heldCases } from "@/lib/health";
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

    // A disagreement waiting on a decision is the most valuable thing in the
    // pool, so a senior is offered it before anything unclaimed — the same
    // reason review is served ahead of authoring. Only a senior: to everyone
    // else a held case is simply not on offer, and asking for one directly is
    // refused the same way any other ineligible case is.
    // Asked for once, used two ways: a senior is offered a held case, and
    // nobody else is offered it at all.
    const held = await heldCases(pool.lsProjectId);

    if (pool.senior) {
      if (held.length > 0) {
        const heldIds = held.map((c) => c.ls_task_id);

        // Two exclusions, both asked by case rather than by pool.
        //
        // A senior must never settle a disagreement they are part of, and the
        // only record of who read what is this table: HEALTH sends the earlier
        // answers with no author, deliberately, so it cannot be asked and must
        // not be inferred. `seen` above answers nearly the same question, but
        // it is scoped to this pool, and a case is a case whichever pool row
        // served it — two pool rows can point at one Label Studio project. The
        // database already takes that view: claim_task_slot matches on
        // (clinician, task) with no pool in it, and one adjudication per case
        // is unique on the task alone. Serving should agree with the rules it
        // will be judged by.
        const [{ data: settled }, { data: alreadyRead }] = await Promise.all([
          supabaseAdmin
            .from("task_completions")
            .select("ls_task_id")
            .eq("kind", "adjudication")
            .in("ls_task_id", heldIds),
          supabaseAdmin
            .from("task_completions")
            .select("ls_task_id")
            .eq("clinician_id", auth.clinicianId)
            .in("ls_task_id", heldIds),
        ]);

        const decided = new Set((settled ?? []).map((r) => r.ls_task_id));
        const theirs = new Set((alreadyRead ?? []).map((r) => r.ls_task_id));

        // Nothing left for this senior is a resting state, not a failure. A
        // case whose every senior has already read it stays held, and an
        // operator settles it through HEALTH's own review path. That is the
        // intended floor: better a case waits for a person who has not already
        // formed a view than be decided by one who has.
        const mine = held.find(
          (c) =>
            !seen.has(c.ls_task_id) &&
            !theirs.has(c.ls_task_id) &&
            !decided.has(c.ls_task_id)
        );

        if (mine) {
          let lsTask;
          try {
            lsTask = await getTask(mine.ls_task_id);
          } catch (err) {
            console.error(`[next] LS unreachable for held case ${mine.ls_task_id}`, err);
            return NextResponse.json(
              { error: "We could not reach the case store. Try again in a moment." },
              { status: 502 }
            );
          }

          const cfg = normalizeConfig(raw0);
          const d = (lsTask.data ?? {}) as Record<string, unknown>;
          return NextResponse.json({
            phase: "adjudicate",
            task_id: mine.ls_task_id,
            pool: { id: pool.id, name: pool.name, purpose: cfg.purpose },
            case_id: caseIdFor(raw0, d),
            context: buildContext(raw0, d),
            eval_config: {
              instructions: cfg.instructions,
              fields: cfg.fields,
              classes: cfg.classes,
            },
            // What the earlier readers decided, and why. HEALTH sends these
            // without an author and they are passed on as they arrived: a
            // senior weighs the reasoning, never the person.
            earlier_answers: mine.earlier_answers ?? [],
            agreement: mine.agreement ?? null,
            already_reviewed_count: readings,
          });
        }
      }
    }

    // A held case is not ordinary work, so it is not offered as ordinary work.
    //
    // Prioritising it for seniors was not enough on its own: a case is held
    // because its readings disagree, which is usually also the point at which
    // it has reached its ceiling and stops being offered anyway. That is a
    // coincidence, not a rule — a pool commissioning three readings holds a
    // disagreement at two — and where it does not hold, an ordinary clinician
    // was served the disagreement as fresh work and their reading was pulled in
    // as a third, muddying the very split a senior was about to settle.
    //
    // If HEALTH cannot be reached this list is empty and the ceiling is the
    // only protection left, which is the same position the platform was in
    // before any of this existed.
    for (const c of held) seen.add(c.ls_task_id);

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
