import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";

export const dynamic = "force-dynamic";

/**
 * Real counts only.
 *
 * Reviews and flags are counted apart and reported apart. A flag is recorded
 * work and is paid as a completed case is, so a clinician who flags honestly
 * should see that work represented rather than absent. But it is not a review,
 * and folding it into a "reviews" figure would tell them something untrue about
 * how many cases they judged. Two numbers, each meaning exactly one thing.
 *
 * Every figure here is a count of rows this clinician actually produced. A
 * stat with no source is omitted from the response rather than estimated —
 * agreement score needs consensus data this service does not yet hold, so it
 * is absent until it can be computed.
 */
export async function GET(req: NextRequest) {
  return withAuth(req, async (_req, auth) => {
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);

    const mine = () =>
      supabaseAdmin
        .from("task_completions")
        .select("id", { count: "exact", head: true })
        .eq("clinician_id", auth.clinicianId);

    const [total, week, flagged, flaggedWeek] = await Promise.all([
      mine().in("kind", READINGS_ONLY),
      mine().in("kind", READINGS_ONLY).gte("completed_at", weekStart.toISOString()),
      mine().eq("kind", "flag"),
      mine().eq("kind", "flag").gte("completed_at", weekStart.toISOString()),
    ]);

    const failure = total.error ?? week.error ?? flagged.error ?? flaggedWeek.error;
    if (failure) {
      console.error("[stats] count failed", failure);
      return NextResponse.json(
        { error: "We could not load your figures." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reviewed_total: total.count ?? 0,
      reviewed_this_week: week.count ?? 0,
      flagged_total: flagged.count ?? 0,
      flagged_this_week: flaggedWeek.count ?? 0,
    });
  });
}
