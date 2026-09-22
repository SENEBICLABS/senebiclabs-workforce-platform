import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { revokeSessionsForClinician } from "@/lib/sessions";

export const dynamic = "force-dynamic";

/**
 * Ends every live session a clinician holds, on every device.
 *
 * For a lost device, or for withdrawing someone's access without deleting
 * them. It takes effect on their next request: verifySessionToken refuses a
 * revoked row. Their account, history and pool access are untouched, so they
 * can sign in again unless something else has changed. Only this clinician's
 * sessions are touched.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withOps(req, async () => {
    const { id } = await params;

    const { data: clinician } = await supabaseAdmin
      .from("clinicians")
      .select("id, email")
      .eq("id", id)
      .maybeSingle();
    if (!clinician) return NextResponse.json({ error: "No such clinician." }, { status: 404 });

    const result = await revokeSessionsForClinician(clinician.id);
    if (!result.ok) {
      return NextResponse.json({ error: "Revoking did not complete." }, { status: 500 });
    }

    return NextResponse.json({ clinician: clinician.email, revoked: result.revoked });
  });
}
