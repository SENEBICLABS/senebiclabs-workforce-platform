import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  return withAuth(req, async (req, auth) => {
    const { poolId, answers } = await req.json();

    if (!poolId || !answers || !Array.isArray(answers)) {
      return NextResponse.json(
        { error: "Invalid request: poolId and answers required" },
        { status: 400 }
      );
    }

    try {
      // Get pool with calibration items
      const { data: pool, error: poolError } = await supabaseAdmin
        .from("pools")
        .select("id, calibration_items, passing_threshold")
        .eq("id", poolId)
        .single();

      if (poolError || !pool) {
        return NextResponse.json(
          { error: "Pool not found" },
          { status: 404 }
        );
      }

      // Score the answers (categorical matching)
      const calibrationItems = pool.calibration_items;
      let correctCount = 0;

      for (const answer of answers) {
        const item = calibrationItems.find(
          (item: { id: string; correct_option?: unknown }) => item.id === answer.itemId
        );

        if (!item) continue;

        // Match against correct_option (categorical)
        if (item.correct_option === answer.answer) {
          correctCount++;
        }
      }

      const score = correctCount / calibrationItems.length;
      const passed = score >= (pool.passing_threshold || 0.8);

      // Record the attempt
      const { error: insertError } = await supabaseAdmin
        .from("calibration_attempts")
        .insert({
          clinician_id: auth.clinicianId,
          pool_id: poolId,
          score,
          passed,
        });

      if (insertError) throw insertError;

      // If they passed, mark them eligible
      if (passed) {
        const { error: eligError } = await supabaseAdmin
          .from("pool_eligibility")
          .upsert(
            {
              clinician_id: auth.clinicianId,
              pool_id: poolId,
              eligible: true,
              eligible_since: new Date().toISOString(),
            },
            {
              onConflict: "clinician_id,pool_id",
            }
          );

        if (eligError) throw eligError;
      }

      return NextResponse.json({
        passed,
        score: Math.round(score * 100),
        correctAnswers: correctCount,
        totalQuestions: calibrationItems.length,
      });
    } catch (error) {
      console.error("Calibration error:", error);
      return NextResponse.json(
        { error: "Failed to submit calibration" },
        { status: 500 }
      );
    }
  });
}
