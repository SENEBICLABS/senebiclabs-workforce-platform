import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/middleware";
import { FORBIDDEN, POOL_CLOSED, requireEligiblePoolForTask } from "@/lib/gate";
import { isTaskNumber, renewReservation } from "@/lib/taskstore";

export const dynamic = "force-dynamic";

/**
 * Keeps a case held while a clinician is still reading it.
 *
 * A case is leased for an hour when it is served. That is generous for one case,
 * but a hard reading, an interruption or a long document can run past it, and a
 * clinician who loses the case mid-sentence loses the work. The workspace calls
 * this while the case is open, and the lease is extended.
 *
 * What it is not: a way to hold a case indefinitely. Every bound is the
 * database's, and all of them have to pass — the lease is this clinician's, the
 * case is still the version they were shown, it has not been renewed more than
 * four times, and it has not been alive longer than eight hours. A held case is
 * work nobody else can do, so it has to come back whatever the browser does.
 *
 * The response says plainly whether the case is still theirs. `held: false` is
 * not an error to swallow: the workspace should tell the clinician the case has
 * been released before they spend more time on it.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  return withAuth(req, async (_req, auth) => {
    const taskId = Number((await params).taskId);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "Unknown task." }, { status: 400 });
    }
    // Only the task store has leases. A Label Studio id has none, and asking for
    // one is a request about a case that cannot be held.
    if (!isTaskNumber(taskId)) {
      return NextResponse.json({ error: "Unknown task." }, { status: 400 });
    }

    // The same gate as every other route that acts on a case: eligibility is read
    // from the database on this request, not inferred from holding a lease.
    // A refusal and a failed read are different answers. The client treats a 502 as a
    // beat it did not get an answer to and retries; a 403 would be read as the case
    // having been taken away, which is the mistake this whole loop is careful about.
    let gated;
    try {
      gated = await requireEligiblePoolForTask(auth.clinicianId, taskId);
    } catch (err) {
      console.error(`[heartbeat] could not establish eligibility for task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (!gated) return FORBIDDEN();
    if (gated.pool.closedAt) return POOL_CLOSED();

    let outcome;
    try {
      outcome = await renewReservation({ clinicianId: auth.clinicianId, taskNo: taskId });
    } catch (err) {
      // Never answer "still yours" when we do not know. The clinician keeps the
      // case for the rest of the lease either way, and the next beat can succeed.
      console.error(`[heartbeat] could not renew the lease on task ${taskId}`, err);
      return NextResponse.json(
        { error: "We could not reach the case store. Try again in a moment." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    // `renewed` is the only outcome that leaves the case theirs. Each of the rest
    // means the hold has ended, and the clinician needs to be told which, because
    // "your time ran out" and "this case was replaced" ask different things of
    // them. None of them is a server error: all are normal, bounded outcomes.
    const held = outcome === "renewed";
    const reason: Record<string, string> = {
      expired: "Your hold on this case ran out and it has gone back to the pool.",
      limit_reached: "This case has been held as long as we can hold it.",
      too_old: "This case has been held as long as we can hold it.",
      stale: "This case was updated and replaced while you were reading it.",
      not_found: "You are not holding this case.",
      invalid: "You are not holding this case.",
    };

    return NextResponse.json(
      held ? { held: true } : { held: false, reason: reason[outcome] ?? reason.not_found },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  });
}
