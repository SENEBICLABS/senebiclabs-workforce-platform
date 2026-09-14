import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { declineAccessRequest } from "@/lib/access-requests";

export const dynamic = "force-dynamic";

/** Declines an access request. The requester is not notified. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withOps(req, async () => {
    const { id } = await params;
    const result = await declineAccessRequest(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ declined: true });
  });
}
