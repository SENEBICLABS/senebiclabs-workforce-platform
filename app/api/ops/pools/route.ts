import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { closedPools } from "@/lib/pool-closure";
import { READINGS_ONLY } from "@/lib/completions";
import { countTasks } from "@/lib/labelstudio";
import { countNativeTasks } from "@/lib/taskstore";
import { poolFacts, withPoolColumns, type PoolRow } from "@/lib/gate";
import { normalizeConfig, type RawEvalConfig } from "@/lib/eval-config";
import { reviewRequired } from "@/lib/review";

export const dynamic = "force-dynamic";

/** Every pool, open or closed, with how much work each has drawn. */
export async function GET(req: NextRequest) {
  return withOps(req, async () => {
    const [{ data: poolRows }, { data: completions }, { data: eligibility }] =
      await Promise.all([
        withPoolColumns((pools) =>
          supabaseAdmin.from("pools").select(`${pools}, open_access`).order("name")
        ),
        supabaseAdmin.from("task_completions").select("pool_id").in("kind", READINGS_ONLY),
        supabaseAdmin.from("pool_eligibility").select("pool_id, eligible, senior"),
      ]);

    const reviewed = new Map<string, number>();
    for (const row of completions ?? []) {
      reviewed.set(row.pool_id, (reviewed.get(row.pool_id) ?? 0) + 1);
    }
    const eligible = new Map<string, number>();
    // Counted separately, because a pool with nobody senior is a pool whose
    // every disagreement falls back to an operator. That is worth an operator
    // seeing before work starts rather than discovering when a case sticks.
    const seniors = new Map<string, number>();
    for (const row of eligibility ?? []) {
      if (row.eligible === false) continue;
      eligible.set(row.pool_id, (eligible.get(row.pool_id) ?? 0) + 1);
      if (row.senior === true) {
        seniors.set(row.pool_id, (seniors.get(row.pool_id) ?? 0) + 1);
      }
    }

    const closed = await closedPools();

    // The select is chosen at run time (see withPoolColumns), so its row type is stated here.
    const pools = (poolRows ?? []) as unknown as (PoolRow & {
      id: string;
      name: string;
      ls_project_id: number;
      open_access?: boolean;
    })[];

    const rows = await Promise.all(
      pools.map(async (p) => {
        // On the native store a pool's config and ceiling are its project's.
        const own = poolFacts(p as unknown as PoolRow);
        const raw = (own.evalConfig ?? null) as RawEvalConfig | null;
        const config = normalizeConfig(raw);

        // A pool whose project is unreachable is still listed, with items null
        // rather than a made-up number.
        let items: number | null = null;
        try {
          items =
            own.native && own.projectId
              ? await countNativeTasks(own.projectId)
              : await countTasks(Number(p.ls_project_id));
        } catch {
          items = null;
        }

        return {
          id: p.id,
          name: p.name,
          ls_project_id: p.ls_project_id,
          purpose: config.purpose,
          review_required: reviewRequired(raw),
          open_access: p.open_access === true,
          closed_at: closed.get(String(p.id)) ?? null,
          max_annotations: own.maxAnnotations,
          task_store: own.native ? "native" : "label_studio",
          project_id: own.projectId,
          items,
          reviewed: reviewed.get(p.id) ?? 0,
          eligible_clinicians: eligible.get(p.id) ?? 0,
          senior_clinicians: seniors.get(p.id) ?? 0,
        };
      })
    );

    return NextResponse.json({ pools: rows });
  });
}
