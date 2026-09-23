import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { PASS_KINDS, type PassKind } from "@/lib/completions";

export const dynamic = "force-dynamic";

/**
 * One clinician's own record of work.
 *
 * Every pass they have made, by kind and by pool, with the date it happened.
 * No amounts and no rates, because there are none: during the pilot payment is
 * arranged directly, and inventing a figure here would be worse than showing
 * none. What this does is make the record visible to the person who earned it,
 * while it is still fresh enough to dispute.
 *
 * Scoped to the caller on every query. auth.clinicianId comes from the verified
 * session and is never read from the request, so there is no id to tamper with.
 */

const RECENT_LIMIT = 250;

export async function GET(req: NextRequest) {
  return withAuth(req, async (_req, auth) => {
    const { data: rows, error } = await supabaseAdmin
      .from("task_completions")
      .select("id, kind, pool_id, ls_task_id, completed_at")
      .eq("clinician_id", auth.clinicianId)
      .order("completed_at", { ascending: false });

    if (error) {
      console.error("[passes] query failed", error);
      return NextResponse.json(
        { error: "We could not load your work record." },
        { status: 500 }
      );
    }

    const passes = rows ?? [];

    // Pool names, for the pools this clinician has actually worked in.
    const poolIds = [...new Set(passes.map((p) => p.pool_id))];
    const names = new Map<string, string>();
    if (poolIds.length > 0) {
      const { data: pools } = await supabaseAdmin
        .from("pools")
        .select("id, name")
        .in("id", poolIds);
      for (const pool of pools ?? []) names.set(pool.id, pool.name);
    }

    const emptyTally = () =>
      Object.fromEntries(PASS_KINDS.map((k) => [k, 0])) as Record<PassKind, number>;

    const byKind = emptyTally();
    const byPool = new Map<string, { pool: string; total: number; kinds: Record<PassKind, number> }>();

    for (const pass of passes) {
      const kind = pass.kind as PassKind;
      if (kind in byKind) byKind[kind] += 1;

      const key = pass.pool_id;
      const entry =
        byPool.get(key) ??
        { pool: names.get(key) ?? "A pool you no longer hold", total: 0, kinds: emptyTally() };
      entry.total += 1;
      if (kind in entry.kinds) entry.kinds[kind] += 1;
      byPool.set(key, entry);
    }

    return NextResponse.json({
      total: passes.length,
      by_kind: byKind,
      by_pool: [...byPool.entries()]
        .map(([id, v]) => ({ pool_id: id, ...v }))
        .sort((a, b) => b.total - a.total),
      recent: passes.slice(0, RECENT_LIMIT).map((p) => ({
        id: p.id,
        kind: p.kind,
        pool: names.get(p.pool_id) ?? "A pool you no longer hold",
        case_ref: p.ls_task_id,
        at: p.completed_at,
      })),
      recent_limit: RECENT_LIMIT,
    });
  });
}
