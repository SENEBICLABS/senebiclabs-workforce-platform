/**
 * What the gate's null means, and what it must never mean.
 *
 * The gate answers "no" the same way for a pool that does not exist and a clinician who
 * may not have it, so a caller cannot tell the two apart. That is deliberate and is kept
 * here. What it must not also cover is "we could not tell": both eligibility reads used
 * to discard the Supabase error value, so a transient database fault fell through to the
 * same null and reached a clinician as 403 "You are not eligible for this pool." On the
 * submit path that message arrives after they have written their answers, and it reads as
 * permanent, so they stop.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

type Reply = { data: unknown; error: unknown };

/** The next reply every query will give. Set per test. */
const next: { reply: Reply } = { reply: { data: null, error: null } };
const calls: string[] = [];

/** A chainable stand-in: every builder method returns itself, maybeSingle resolves. */
function query(table: string) {
  calls.push(table);
  const self: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "in", "order", "limit", "is"]) {
    self[method] = () => self;
  }
  self.maybeSingle = () => Promise.resolve(next.reply);
  self.single = () => Promise.resolve(next.reply);
  return self;
}

vi.mock("server-only", () => ({}));
vi.mock("../lib/supabase", () => ({ supabaseAdmin: { from: (t: string) => query(t) } }));
// The pool's closure and the task read are not what is under test here.
vi.mock("../lib/pool-closure", () => ({ closedAtFor: async () => null }));
vi.mock("../lib/taskstore", () => ({
  getNativeTask: async (taskNo: number) => ({
    id: taskNo,
    projectId: "project-under-test",
    status: "queued",
    data: {},
    content: {},
  }),
}));

import { GateError, requireEligiblePool, requireEligiblePoolForTask } from "../lib/gate";

const POOL = {
  id: "pool-1",
  name: "A pool",
  project_id: "project-under-test",
  closed_at: null,
  project: { task_store: "native", eval_config: { reviewers_per_item: 2 } },
};

afterEach(() => {
  next.reply = { data: null, error: null };
  calls.length = 0;
});

describe("a genuine refusal", () => {
  it("is null when no such pool exists", async () => {
    next.reply = { data: null, error: null };
    await expect(requireEligiblePool("clinician-1", "pool-1")).resolves.toBeNull();
  });

  it("is null when the pool exists but the clinician is not eligible", async () => {
    // The inner join yields nothing in both cases, which is the point: the caller cannot
    // tell "no such pool" from "not yours", and this keeps that true.
    next.reply = { data: null, error: null };
    await expect(requireEligiblePool("clinician-1", "pool-1")).resolves.toBeNull();
    next.reply = { data: {}, error: null };
    await expect(requireEligiblePool("clinician-1", "pool-1")).resolves.toBeNull();
  });

  it("is null for a task the clinician may not work", async () => {
    next.reply = { data: null, error: null };
    await expect(requireEligiblePoolForTask("clinician-1", 1_000_000_000)).resolves.toBeNull();
  });
});

describe("a failed read", () => {
  it("throws from requireEligiblePool rather than refusing", async () => {
    next.reply = { data: null, error: { code: "57014", message: "statement timeout" } };
    await expect(requireEligiblePool("clinician-1", "pool-1")).rejects.toBeInstanceOf(GateError);
  });

  it("throws from requireEligiblePoolForTask rather than refusing", async () => {
    next.reply = { data: null, error: { code: "08006", message: "connection failure" } };
    await expect(
      requireEligiblePoolForTask("clinician-1", 1_000_000_000)
    ).rejects.toBeInstanceOf(GateError);
  });

  it("says what failed and the database's code, and nothing else", async () => {
    next.reply = { data: null, error: { code: "57014", message: "statement timeout" } };
    const err = await requireEligiblePool("clinician-secret-id", "pool-secret-id").catch((e) => e);
    expect(err).toBeInstanceOf(GateError);
    const text = `${(err as Error).name} ${(err as Error).message}`;
    expect(text).toContain("57014");
    // No identifier, no credential, no clinician.
    expect(text).not.toContain("clinician-secret-id");
    expect(text).not.toContain("pool-secret-id");
    expect(text).not.toMatch(/eyJ|apikey|service_role|Bearer|supabase\.co/i);
  });
});

describe("a successful lookup", () => {
  it("returns the pool, with senior carried through", async () => {
    next.reply = { data: { senior: true, pools: POOL }, error: null };
    const pool = await requireEligiblePool("clinician-1", "pool-1");
    expect(pool).not.toBeNull();
    expect(pool?.id).toBe("pool-1");
    expect(pool?.senior).toBe(true);
    expect(pool?.projectId).toBe("project-under-test");
  });

  it("returns the pool and the task together for a task lookup", async () => {
    next.reply = { data: { senior: false, pools: POOL }, error: null };
    const found = await requireEligiblePoolForTask("clinician-1", 1_000_000_007);
    expect(found?.pool.id).toBe("pool-1");
    expect(found?.pool.senior).toBe(false);
    expect(found?.task.id).toBe(1_000_000_007);
  });
});

describe("the pattern that caused this", () => {
  it("is gone from both eligibility reads", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(join(__dirname, "..", "lib", "gate.ts"), "utf8");

    // Keeping `error` is the whole fix; discarding it is what made a fault a refusal.
    expect(src).not.toMatch(/const \{ data \} = await supabaseAdmin/);
    expect(src.match(/const \{ data, error \} = await supabaseAdmin/g) ?? []).toHaveLength(2);
    expect(src.match(/throw new GateError/g) ?? []).toHaveLength(2);
  });
});
