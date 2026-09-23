import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";

export const dynamic = "force-dynamic";

/** Counts across the estate. Every figure is a real count, never an estimate. */
export async function GET(req: NextRequest) {
  return withOps(req, async () => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [clinicians, pools, invites, completions, thisWeek] = await Promise.all([
      supabaseAdmin.from("clinicians").select("id, active, can_invite"),
      supabaseAdmin.from("pools").select("id, open_access"),
      supabaseAdmin.from("invites").select("id, status"),
      supabaseAdmin
        .from("task_completions")
        .select("id", { count: "exact", head: true })
        .in("kind", READINGS_ONLY),
      supabaseAdmin
        .from("task_completions")
        .select("id", { count: "exact", head: true })
        .in("kind", READINGS_ONLY)
        .gte("completed_at", weekAgo),
    ]);

    const people = clinicians.data ?? [];
    const poolRows = pools.data ?? [];

    return NextResponse.json({
      clinicians: {
        total: people.length,
        active: people.filter((c) => c.active !== false).length,
        can_invite: people.filter((c) => c.can_invite === true).length,
      },
      invites: {
        pending: (invites.data ?? []).filter((i) => i.status === "pending").length,
      },
      pools: {
        total: poolRows.length,
        open: poolRows.filter((p) => p.open_access === true).length,
        closed: poolRows.filter((p) => p.open_access !== true).length,
      },
      reviews: {
        total: completions.count ?? 0,
        this_week: thisWeek.count ?? 0,
      },
    });
  });
}
