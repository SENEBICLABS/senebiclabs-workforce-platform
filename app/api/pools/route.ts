import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";
import { normalizeConfig, type RawEvalConfig } from "@/lib/eval-config";

export const dynamic = "force-dynamic";

/**
 * Pools this clinician is eligible for. Nothing else is ever listed.
 *
 * Deliberately carries no pool total. A pool's task count is not work this
 * clinician can do: cases at their reviewer ceiling are gone, cases they have
 * judged or flagged are gone, and a senior may have one contested case waiting
 * while the total says ten. Shown as a denominator it promised an allocation
 * that does not exist — cases are claimed competitively — so what is reported
 * is what they have done, which is theirs and is always true.
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async (_req, auth) => {
    // Both of these need only the clinician's id, so neither waits for the
    // other. They used to run back to back, which cost a whole extra round trip
    // to the database on every dashboard load for no reason.
    const [
      { data: rows, error },
      { data: completions },
    ] = await Promise.all([
      supabaseAdmin
        .from("pool_eligibility")
        .select(
          "pool_id, pools!inner(id, name, ls_project_id, eval_config, maximum_annotations)"
        )
        .eq("clinician_id", auth.clinicianId)
        .eq("eligible", true),
      // Readings only. Counting flags here would advance a clinician's progress
      // through a pool for cases they explicitly declined to judge, and could
      // mark a pool "complete" without it having been reviewed.
      supabaseAdmin
        .from("task_completions")
        .select("pool_id")
        .eq("clinician_id", auth.clinicianId)
        .in("kind", READINGS_ONLY),
    ]);

    if (error) {
      console.error("[pools] eligibility query failed", error);
      return NextResponse.json(
        { error: "We could not load your pools." },
        { status: 500 }
      );
    }

    const pools = (rows ?? [])
      .map((row) => (row as unknown as { pools: Record<string, unknown> }).pools)
      .filter(Boolean);

    if (pools.length === 0) return NextResponse.json({ pools: [] });

    const reviewedByPool = new Map<string, number>();
    for (const row of completions ?? []) {
      reviewedByPool.set(row.pool_id, (reviewedByPool.get(row.pool_id) ?? 0) + 1);
    }

    const listed = await Promise.all(
      pools.map(async (pool) => {
        const id = String(pool.id);
        const config = normalizeConfig(
          (pool.eval_config ?? null) as RawEvalConfig | null
        );
        const reviewed = reviewedByPool.get(id) ?? 0;

        // Only what they have done. "Complete" used to mean their own count
        // had reached the pool's total, which a clinician can never do once
        // anyone else takes a case: it read as finished while work remained,
        // and it disabled the button that would have shown them otherwise.
        // Whether anything is left for them is answered by asking for the next
        // case, which says "you are all caught up" when there is not.
        const status = reviewed > 0 ? "in_progress" : "not_started";

        return {
          id,
          name: String(pool.name),
          purpose: config.purpose,
          description: config.title,
          reviewed_by_me: reviewed,
          status,
        };
      })
    );

    listed.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ pools: listed });
  });
}
