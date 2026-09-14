import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { markAccessRequestReviewed } from "@/lib/access-requests";

export const dynamic = "force-dynamic";

/** Marks an access request reviewed. The requester is not notified. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withOps(req, async () => {
    const { id } = await params;
    const result = await markAccessRequestReviewed(id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ reviewed: true });
  });
}
