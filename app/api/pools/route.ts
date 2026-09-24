import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";
import { countTasks } from "@/lib/labelstudio";
import { normalizeConfig, type RawEvalConfig } from "@/lib/eval-config";

export const dynamic = "force-dynamic";

/**
 * Pools this clinician is eligible for. Nothing else is ever listed.
 *
 * `items` comes from the backing LS project; if LS cannot be reached for a
 * pool, the pool is still listed with items null rather than a made-up count.
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

        let items: number | null = null;
        try {
          items = await countTasks(Number(pool.ls_project_id));
        } catch (err) {
          console.error(`[pools] LS project ${pool.ls_project_id} unreachable`, err);
        }

        const status =
          items !== null && reviewed >= items && items > 0
            ? "complete"
            : reviewed > 0
              ? "in_progress"
              : "not_started";

        return {
          id,
          name: String(pool.name),
          purpose: config.purpose,
          description: config.title,
          items,
          reviewed_by_me: reviewed,
          status,
        };
      })
    );

    listed.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ pools: listed });
  });
}
