import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { inviteFromRequest } from "@/lib/access-requests";

export const dynamic = "force-dynamic";

/**
 * Accepts an access request by sending an ordinary invitation to its address.
 *
 * The same invitation, expiry and email as one sent from the invite form, so a
 * clinician who asked and one who was invited unprompted arrive the same way.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withOps(req, async () => {
    const { id } = await params;
    const result = await inviteFromRequest(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ invited: result.email });
  });
}
