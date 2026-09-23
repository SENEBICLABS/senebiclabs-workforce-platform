import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";
import { READINGS_ONLY } from "@/lib/completions";

export const dynamic = "force-dynamic";

/**
 * Real counts only.
 *
 * These are readings, not passes. A flag is recorded work and appears on the
 * work record at /earnings, but it is not a review, and a "reviews" figure that
 * counted declined cases would be telling the clinician something untrue.
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

    const [total, week] = await Promise.all([
      supabaseAdmin
        .from("task_completions")
        .select("id", { count: "exact", head: true })
        .eq("clinician_id", auth.clinicianId)
        .in("kind", READINGS_ONLY),
      supabaseAdmin
        .from("task_completions")
        .select("id", { count: "exact", head: true })
        .eq("clinician_id", auth.clinicianId)
        .in("kind", READINGS_ONLY)
        .gte("completed_at", weekStart.toISOString()),
    ]);

    if (total.error || week.error) {
      console.error("[stats] count failed", total.error ?? week.error);
      return NextResponse.json(
        { error: "We could not load your figures." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reviewed_total: total.count ?? 0,
      reviewed_this_week: week.count ?? 0,
    });
  });
}
