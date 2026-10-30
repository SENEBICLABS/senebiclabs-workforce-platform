/**
 * The two routes that had no handling for a failed eligibility read.
 *
 * Every other route that calls the gate already answered a store failure with a 502 and
 * the words "We could not reach the case store", because getNativeTask throws. These two
 * had no catch, so a transient fault became 403 "You are not eligible for this pool."
 *
 * The distinction is the whole point: 403 is permanent and a clinician who believes it
 * stops working; 502 is "try again", and for the heartbeat it is what the client retries
 * rather than treating the case as taken away.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const gate = {
  outcome: "allow" as "allow" | "deny" | "fail",
};

class GateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateError";
  }
}

const POOL = {
  id: "pool-1",
  name: "A pool",
  maxAnnotations: 2,
  evalConfig: null,
  senior: false,
  closedAt: null,
  projectId: "project-1",
};

function resolve<T>(value: T): T | null {
  if (gate.outcome === "fail") throw new GateError("pool eligibility: 57014");
  if (gate.outcome === "deny") return null;
  return value;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/middleware", () => ({
  withAuth: (req: NextRequest, handler: (r: NextRequest, a: unknown) => Promise<Response>) =>
    handler(req, { clinicianId: "clinician-1", email: "c@example.test" }),
}));
vi.mock("@/lib/gate", () => ({
  GateError,
  FORBIDDEN: () =>
    NextResponse.json({ error: "You are not eligible for this pool." }, { status: 403 }),
  POOL_CLOSED: () => NextResponse.json({ error: "This pool is closed." }, { status: 409 }),
  requireEligiblePool: async () => resolve(POOL),
  requireEligiblePoolForTask: async () => resolve({ pool: POOL, task: { id: 1_000_000_000 } }),
}));
// Nothing past the gate is under test; these keep the handlers from reaching further.
vi.mock("@/lib/availability", () => ({
  availabilityFor: async () => ({ available: 0, remaining: 0, closed: false, next: null, degraded: false, completed: 0 }),
}));
vi.mock("@/lib/taskstore", () => ({
  isTaskNumber: (id: number) => Number.isInteger(id) && id >= 1_000_000_000,
  renewReservation: async () => "renewed",
  getNativeTask: async () => null,
  reserveNextItem: async () => null,
  reserveAdjudication: async () => null,
}));

const { GET: next } = await import("../app/api/pools/[poolId]/next/route");
const { POST: heartbeat } = await import("../app/api/tasks/[taskId]/heartbeat/route");

const req = (url: string) => new NextRequest(new URL(url, "http://localhost"));

beforeEach(() => {
  gate.outcome = "allow";
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/pools/[poolId]/next", () => {
  it("answers 403 when the gate genuinely refuses", async () => {
    gate.outcome = "deny";
    const res = await next(req("/api/pools/pool-1/next"), {
      params: Promise.resolve({ poolId: "pool-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("answers 502 when the eligibility read failed", async () => {
    gate.outcome = "fail";
    const res = await next(req("/api/pools/pool-1/next"), {
      params: Promise.resolve({ poolId: "pool-1" }),
    });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("We could not reach the case store. Try again in a moment.");
  });

  it("never says 'not eligible' for a failed read", async () => {
    gate.outcome = "fail";
    const res = await next(req("/api/pools/pool-1/next"), {
      params: Promise.resolve({ poolId: "pool-1" }),
    });
    expect(JSON.stringify(await res.json())).not.toMatch(/not eligible/i);
  });
});

describe("POST /api/tasks/[taskId]/heartbeat", () => {
  const call = (outcome: typeof gate.outcome) => {
    gate.outcome = outcome;
    return heartbeat(req("/api/tasks/1000000000/heartbeat"), {
      params: Promise.resolve({ taskId: "1000000000" }),
    });
  };

  it("answers 403 when the gate genuinely refuses", async () => {
    expect((await call("deny")).status).toBe(403);
  });

  it("answers 502 when the eligibility read failed", async () => {
    const res = await call("fail");
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("We could not reach the case store. Try again in a moment.");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("never reports a lease outcome for a failed read", async () => {
    // `held` is the only thing that ends a hold. A failed read must not carry one.
    const res = await call("fail");
    expect(Object.keys((await res.json()) as object)).not.toContain("held");
  });

  it("still renews when the gate allows it", async () => {
    const res = await call("allow");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ held: true });
  });
});
