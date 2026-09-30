import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { forgetClosures } from "@/lib/pool-closure";

export const dynamic = "force-dynamic";

/**
 * Stops a pool taking work, or lets it take work again.
 *
 * Not the same control as open access, which is about who is granted the pool.
 * This is about whether the pool is still being worked at all: a project that
 * has gone downstream should take no more readings, however many cases are
 * technically still under the ceiling, because work done after delivery is work
 * nobody asked for and nobody planned to pay for.
 *
 * A pool also finishes on its own, when nothing is left below the ceiling and
 * nothing is still held. That needs no operator and is not recorded here — the
 * clinician's pool list works it out. This column is only for the fact no count
 * can tell you.
 *
 * Closing is enforced rather than displayed: the pool list stops offering it,
 * and submit, flag and review all refuse it, so a tab left open since before
 * the pool closed cannot write into it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withOps(req, async () => {
    const { id } = await params;

    let value: boolean;
    try {
      value = Boolean((await req.json())?.value);
    } catch {
      return NextResponse.json({ error: "Malformed request." }, { status: 400 });
    }

    // The timestamp, not a flag: "when did this pool stop taking work" is the
    // question anyone asks afterwards, and a boolean cannot answer it.
    const { data, error } = await supabaseAdmin
      .from("pools")
      .update({ closed_at: value ? new Date().toISOString() : null })
      .eq("id", id)
      .select("id, name, closed_at");

    if (error) {
      // The column arrives with migration 020. Say so rather than "that did
      // not save", which would send an operator looking for the wrong fault.
      if (error.code === "42703") {
        console.error("[ops] pools.closed_at is missing; run migration 020");
        return NextResponse.json(
          { error: "Closing pools needs migration 020. Run it, then try again." },
          { status: 503 }
        );
      }
      console.error("[ops] closed_at update failed", error);
      return NextResponse.json({ error: "That did not save." }, { status: 500 });
    }
    if (!data?.length) {
      return NextResponse.json({ error: "No such pool." }, { status: 404 });
    }

    forgetClosures();

    return NextResponse.json({
      pool: data[0],
      note: value
        ? "Closed. Clinicians are no longer offered this pool, and submissions to it are refused."
        : "Open. Clinicians are offered this pool again wherever cases remain for them.",
    });
  });
}
