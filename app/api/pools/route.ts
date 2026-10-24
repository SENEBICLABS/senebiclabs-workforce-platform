import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { availabilityFor, type PoolFacts } from "@/lib/availability";
import { poolFacts, withPoolColumns, type PoolRow } from "@/lib/gate";
import { closedPools } from "@/lib/pool-closure";
import { normalizeConfig, type RawEvalConfig } from "@/lib/eval-config";

export const dynamic = "force-dynamic";

/**
 * Pools this clinician is eligible for. Nothing else is ever listed.
 *
 * Every number here is theirs. There is no pool total, because a pool's task
 * count is not work this clinician can do — cases at the reviewer ceiling are
 * gone, cases they have judged or flagged are gone, and a senior may have one
 * contested case waiting while the total says ten. Shown as a denominator it
 * promised an allocation that does not exist, since cases are claimed
 * competitively.
 *
 * What replaced it is not a smaller number from the same source but a different
 * question, asked of lib/availability and answered the same way the queue
 * answers it. The two used to disagree: a pool worked to the end still showed a
 * card reading "in progress" with a button that led to "you're all caught up",
 * because the card came from a project's task count and the workspace came from
 * what was actually on offer. One computation now serves both.
 *
 * It costs. This route made no upstream call at all and answered in about half
 * a second; it now reads the project's task states from Label Studio and the
 * held list from HEALTH, each around 1.3s, in parallel across pools, so a cold
 * instance answers in about 4s and a warm one in about 1s. That is the price of
 * the number being true, and the half-second version was fast because it was
 * answering an easier question wrongly. The task states are cached for 30s and
 * dropped on any annotation write, which covers the common case of a clinician
 * working through a pool and watching their own count fall.
 *
 * The count can still go stale between the card rendering and the button being
 * pressed, because cases are claimed competitively and another clinician may
 * take the last one first. That is not a bug this can remove, and the workspace
 * says so plainly when it happens.
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async (_req, auth) => {
    const [{ data: rows, error }, closed] = await Promise.all([
      withPoolColumns((pools) =>
        supabaseAdmin
          .from("pool_eligibility")
          .select(`pool_id, senior, pools!inner(${pools})`)
          .eq("clinician_id", auth.clinicianId)
          .eq("eligible", true)
      ),
      closedPools(),
    ]);

    if (error) {
      console.error("[pools] eligibility query failed", error);
      return NextResponse.json(
        { error: "We could not load your pools." },
        { status: 500 }
      );
    }

    const eligible = (rows ?? [])
      .map((row) => row as unknown as { senior?: boolean; pools: PoolRow })
      .filter((row) => Boolean(row.pools));

    if (eligible.length === 0) return NextResponse.json({ pools: [] });

    const listed = await Promise.all(
      eligible.map(async (row) => {
        const pool = row.pools;
        // On the native store the config and the ceiling are the project's own.
        const own = poolFacts(pool);
        const config = normalizeConfig(own.evalConfig as RawEvalConfig | null);

        const facts: PoolFacts = {
          id: String(pool.id),
          lsProjectId: Number(pool.ls_project_id),
          maxAnnotations: own.maxAnnotations,
          evalConfig: own.evalConfig,
          senior: row.senior === true,
          closedAt: closed.get(String(pool.id)) ?? null,
          native: own.native,
          projectId: own.projectId,
        };

        // Fails soft, one pool at a time, and inside availabilityFor rather
        // than here: a pool whose case store cannot be reached comes back with
        // a null count and their own completed figure intact. Null is not zero
        // and the card must not render it as one — "no cases available" would
        // send a clinician away from a pool that is full of work.
        const state = await availabilityFor(facts, auth.clinicianId);

        return {
          id: facts.id,
          name: String(pool.name),
          purpose: config.purpose,
          description: config.title,
          available_to_you: state.available,
          completed_by_you: state.completed,
          closed: state.closed,
        };
      })
    );

    // Closed pools last: they are a record of work done rather than work to do,
    // and a clinician scanning for something to pick up should not have to read
    // past them.
    listed.sort((a, b) =>
      a.closed === b.closed
        ? a.name.localeCompare(b.name)
        : a.closed
          ? 1
          : -1
    );

    return NextResponse.json({ pools: listed });
  });
}
