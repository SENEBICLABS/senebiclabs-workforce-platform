import { NextRequest, NextResponse } from "next/server";
import { withOps } from "@/lib/ops-auth";
import { listPendingAccessRequests } from "@/lib/access-requests";

export const dynamic = "force-dynamic";

/** Access requests waiting for a decision, newest first. */
export async function GET(req: NextRequest) {
  return withOps(req, async () =>
    NextResponse.json({ requests: await listPendingAccessRequests() })
  );
}
