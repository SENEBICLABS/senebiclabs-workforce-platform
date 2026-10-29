/**
 * The heartbeat loop: what it does while a clinician reads, and what it does when the
 * lease, the network or the clinician does something unexpected.
 *
 * The clock and the scheduler are injected, so each case is arranged exactly rather than
 * waited for. `run()` drains the queue a fixed number of times, which is enough for the
 * chains these tests build and short enough to fail rather than hang.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_INACTIVE_RECHECK_MS,
  DEFAULT_INTERVAL_MS,
  heartbeatIntervalMs,
  LEASE_MS,
  MAX_INTERVAL_MS,
  MIN_INTERVAL_MS,
  startHeartbeat,
  type BeatResult,
  type HeartbeatOptions,
} from "../lib/heartbeat";

/** A scheduler we drive by hand: nothing happens until `run()` is called. */
function fakeClock() {
  let next = 1;
  const queue = new Map<number, { fn: () => void; ms: number }>();
  return {
    delays: [] as number[],
    schedule(fn: () => void, ms: number) {
      const id = next++;
      queue.set(id, { fn, ms });
      this.delays.push(ms);
      return id;
    },
    cancel(handle: unknown) {
      queue.delete(handle as number);
    },
    pending() {
      return queue.size;
    },
    /** Fires everything currently queued, then anything that queued in turn. */
    async run(rounds = 12) {
      for (let i = 0; i < rounds; i++) {
        const due = [...queue.entries()];
        if (due.length === 0) return;
        queue.clear();
        for (const [, entry] of due) entry.fn();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

function start(
  results: BeatResult[],
  extra: Partial<HeartbeatOptions> = {}
) {
  const clock = fakeClock();
  const lost = vi.fn();
  const beat = vi.fn(async () => results.shift() ?? { held: true as const });
  const handle = startHeartbeat({
    beat,
    onLost: lost,
    schedule: (fn, ms) => clock.schedule(fn, ms),
    cancel: (h) => clock.cancel(h),
    ...extra,
  });
  return { clock, lost, beat, handle };
}

describe("while the clinician is reading", () => {
  it("does not beat before the first interval", () => {
    const { beat, clock } = start([]);
    expect(beat).not.toHaveBeenCalled();
    expect(clock.delays).toEqual([DEFAULT_INTERVAL_MS]);
  });

  it("keeps renewing for as long as the case is held", async () => {
    const { beat, clock, lost } = start([{ held: true }, { held: true }, { held: true }]);
    await clock.run(4);
    expect(beat.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(lost).not.toHaveBeenCalled();
  });

  it("beats inside the hour-long lease, so a renewal is never wasted", () => {
    const { clock } = start([]);
    expect(clock.delays[0]).toBeLessThan(60 * 60 * 1000);
    expect(clock.delays[0]).toBeGreaterThan(30 * 60 * 1000);
  });
});

describe("stopping", () => {
  it("stops on cleanup, and a timer that fires afterwards does nothing", async () => {
    const { beat, clock, handle } = start([]);
    handle.stop();
    await clock.run();
    expect(beat).not.toHaveBeenCalled();
    expect(clock.pending()).toBe(0);
  });

  it("is safe to stop twice", () => {
    const { handle } = start([]);
    handle.stop();
    expect(() => handle.stop()).not.toThrow();
  });

  it("drops a reply that lands after the clinician has moved on", async () => {
    // The ordinary case: they submit while a beat is still in the air. The reply must not
    // reach the next case, and must not report a loss against it.
    let release: (r: BeatResult) => void = () => {};
    const clock = fakeClock();
    const lost = vi.fn();
    const handle = startHeartbeat({
      beat: () => new Promise<BeatResult>((resolve) => { release = resolve; }),
      onLost: lost,
      schedule: (fn, ms) => clock.schedule(fn, ms),
      cancel: (h) => clock.cancel(h),
    });
    await clock.run(1);
    handle.stop();
    release({ held: false, reason: "gone" });
    await Promise.resolve();
    await Promise.resolve();
    expect(lost).not.toHaveBeenCalled();
    expect(clock.pending()).toBe(0);
  });
});

describe("two beats never overlap", () => {
  it("does not start a second beat while the first is still out", async () => {
    let outstanding = 0;
    let peak = 0;
    const clock = fakeClock();
    const handle = startHeartbeat({
      beat: async () => {
        outstanding += 1;
        peak = Math.max(peak, outstanding);
        await Promise.resolve();
        outstanding -= 1;
        return { held: true };
      },
      onLost: vi.fn(),
      schedule: (fn, ms) => clock.schedule(fn, ms),
      cancel: (h) => clock.cancel(h),
    });
    await clock.run(6);
    handle.stop();
    expect(peak).toBe(1);
  });
});

describe("when the lease has ended", () => {
  const reasons: [string, BeatResult][] = [
    ["it lapsed", { held: false, reason: "Your hold on this case ran out and it has gone back to the pool." }],
    ["the renewal cap was reached", { held: false, reason: "This case has been held as long as we can hold it." }],
    ["the case was replaced", { held: false, reason: "This case was updated and replaced while you were reading it." }],
    ["it is not theirs", { held: false, reason: "You are not holding this case." }],
  ];

  for (const [name, result] of reasons) {
    it(`tells the clinician when ${name}, in those words`, async () => {
      const { clock, lost } = start([result]);
      await clock.run(2);
      expect(lost).toHaveBeenCalledTimes(1);
      expect(lost).toHaveBeenCalledWith((result as { reason: string }).reason);
    });
  }

  it("says it once and stops, rather than repeating the bad news", async () => {
    const { clock, lost, beat } = start([
      { held: false, reason: "gone" },
      { held: true },
      { held: true },
    ]);
    await clock.run(6);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(beat).toHaveBeenCalledTimes(1);
    expect(clock.pending()).toBe(0);
  });
});

describe("when a beat goes unanswered", () => {
  it("retries with a growing delay rather than giving up at once", async () => {
    const { clock, lost } = start([{ unknown: true }, { unknown: true }, { held: true }]);
    await clock.run(4);
    expect(lost).not.toHaveBeenCalled();
    const retries = clock.delays.slice(1, 3);
    expect(retries[0]).toBeLessThan(DEFAULT_INTERVAL_MS);
    expect(retries[1]).toBeGreaterThan(retries[0]);
  });

  it("goes back to the ordinary interval once a beat lands", async () => {
    const { clock } = start([{ unknown: true }, { held: true }]);
    await clock.run(3);
    expect(clock.delays[clock.delays.length - 1]).toBe(DEFAULT_INTERVAL_MS);
  });

  it("gives up after a bounded number of tries, without claiming the case was lost", async () => {
    const { clock, lost } = start(
      [{ unknown: true }, { unknown: true }],
      { maxFailures: 2 }
    );
    await clock.run(4);
    expect(lost).toHaveBeenCalledTimes(1);
    // We do not know the lease is gone, so we must not say it is.
    const said = lost.mock.calls[0][0] as string;
    expect(said).toMatch(/could not confirm/i);
    expect(said).not.toMatch(/ran out|gone back/i);
  });

  it("treats a refusal as unanswered, not as the case being taken away", async () => {
    // The regression this guards. A 403 from the heartbeat route does not mean the hold
    // has ended: every lease outcome arrives as a 200 with `held`, and the eligibility
    // read behind that 403 swallows a transient database error. Reading it as confirmed
    // loss stopped the loop, and the hold then lapsed for real an hour later, so a
    // momentary blip caused the loss it announced.
    class ApiErrorLike extends Error {
      status: number;
      constructor(status: number) {
        super(`HTTP ${status}`);
        this.status = status;
      }
    }
    const clock = fakeClock();
    const lost = vi.fn();
    let calls = 0;
    startHeartbeat({
      beat: async () => {
        calls += 1;
        if (calls <= 2) throw new ApiErrorLike(403);
        return { held: true };
      },
      onLost: lost,
      schedule: (fn, ms) => clock.schedule(fn, ms),
      cancel: (h) => clock.cancel(h),
    });
    await clock.run(5);

    expect(lost).not.toHaveBeenCalled();
    expect(calls).toBeGreaterThanOrEqual(3);          // retried rather than giving up
    const retries = clock.delays.slice(1, 3);
    expect(retries[0]).toBeLessThan(DEFAULT_INTERVAL_MS);   // backoff, not the full wait
    expect(clock.delays[clock.delays.length - 1]).toBe(DEFAULT_INTERVAL_MS);
  });

  it("says the hold is unconfirmed, never that it is lost, when only refusals come back", async () => {
    class ApiErrorLike extends Error {
      status = 403;
    }
    const clock = fakeClock();
    const lost = vi.fn();
    startHeartbeat({
      beat: async () => {
        throw new ApiErrorLike();
      },
      onLost: lost,
      maxFailures: 2,
      schedule: (fn, ms) => clock.schedule(fn, ms),
      cancel: (h) => clock.cancel(h),
    });
    await clock.run(5);

    expect(lost).toHaveBeenCalledTimes(1);
    const said = lost.mock.calls[0][0] as string;
    expect(said).toMatch(/could not confirm/i);
    expect(said).not.toMatch(/not holding|ran out|gone back/i);
  });

  it("treats a thrown beat as unanswered rather than crashing the loop", async () => {
    const clock = fakeClock();
    const lost = vi.fn();
    let calls = 0;
    startHeartbeat({
      beat: async () => {
        calls += 1;
        if (calls === 1) throw new Error("network");
        return { held: true };
      },
      onLost: lost,
      schedule: (fn, ms) => clock.schedule(fn, ms),
      cancel: (h) => clock.cancel(h),
    });
    await clock.run(4);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(lost).not.toHaveBeenCalled();
  });
});

describe("a tab nobody is working in", () => {
  it("skips the beat, so the case goes back to the pool on its own", async () => {
    const { clock, beat, lost } = start([], { isActive: () => false });
    await clock.run(4);
    expect(beat).not.toHaveBeenCalled();
    expect(lost).not.toHaveBeenCalled();
    // Still watching, so it picks up again if they come back to it.
    expect(clock.pending()).toBe(1);
  });

  it("looks again soon after a skip, so a glance away does not cost the case", async () => {
    // A full interval later would be past the lease's own expiry.
    const { clock } = start([], { isActive: () => false });
    await clock.run(2);
    const afterSkip = clock.delays[clock.delays.length - 1];
    expect(afterSkip).toBe(DEFAULT_INACTIVE_RECHECK_MS);
    expect(afterSkip).toBeLessThan(10 * 60 * 1000);
  });

  it("starts beating again when they come back", async () => {
    let active = false;
    const { clock, beat } = start([], { isActive: () => active });
    await clock.run(2);
    expect(beat).not.toHaveBeenCalled();
    active = true;
    await clock.run(2);
    expect(beat).toHaveBeenCalled();
  });
});

describe("what a heartbeat is not", () => {
  it("never reports anything about a submission", async () => {
    // The loop has no way to say "saved": its only outputs are the lease's own fate.
    const { clock, lost } = start([{ held: true }, { held: true }]);
    await clock.run(3);
    expect(lost).not.toHaveBeenCalled();
    // A held lease produces no callback at all, so nothing downstream can mistake a
    // renewal for a recorded review.
  });
});

describe("the configured interval", () => {
  it("is used when it is a sensible whole number of milliseconds", () => {
    expect(heartbeatIntervalMs("3000")).toBe(3000);
    expect(heartbeatIntervalMs("1500000")).toBe(1_500_000);
  });

  it("falls back to the default when unset or blank", () => {
    expect(heartbeatIntervalMs(undefined)).toBeUndefined();
    expect(heartbeatIntervalMs("")).toBeUndefined();
    expect(heartbeatIntervalMs("   ")).toBeUndefined();
  });

  it("refuses anything that would beat continuously or never", () => {
    // Each of these would cost the clinician their case: a flood of renewals spends the
    // four allowed in moments, and a value past the lease lets the hold expire unbeaten.
    for (const bad of ["0", "-1", "999", "abc", "NaN", "Infinity", "1e9", "60.5", "3600000"]) {
      expect(heartbeatIntervalMs(bad), bad).toBeUndefined();
    }
  });

  it("keeps its ceiling inside the lease, so a first beat is always attempted", () => {
    expect(MAX_INTERVAL_MS).toBeLessThan(LEASE_MS);
    expect(heartbeatIntervalMs(String(MAX_INTERVAL_MS))).toBe(MAX_INTERVAL_MS);
    expect(heartbeatIntervalMs(String(MAX_INTERVAL_MS + 1))).toBeUndefined();
    expect(heartbeatIntervalMs(String(MIN_INTERVAL_MS - 1))).toBeUndefined();
  });
});

describe("the workspace's beat", () => {
  // The loop has always treated a throw as unknown, so the tests above would pass with or
  // without the fix: the defect was in the component, which caught the error itself and
  // turned a 403 into a lease outcome before the loop ever saw it. Nothing in this repo
  // can render that component (vitest runs in node, with no DOM), so the regression is
  // pinned at the source, the way tests/no-label-studio.test.ts pins its own rule.
  const workspace = readFileSync(join(__dirname, "..", "app", "workspace", "page.tsx"), "utf8");
  const beat = workspace.slice(
    workspace.indexOf("beat: async () =>"),
    workspace.indexOf("isActive:")
  );

  it("exists where this test expects it", () => {
    expect(beat).toContain("api.heartbeat");
    expect(beat.length).toBeGreaterThan(40);
  });

  it("never decides the hold has ended from a status code", () => {
    expect(beat).not.toMatch(/\b403\b/);
    expect(beat).not.toMatch(/\.status\b/);
    expect(beat).not.toMatch(/instanceof ApiError/);
  });

  it("reports only what the server said about the lease", () => {
    // `held` and `reason` come straight from the reply; the component invents neither.
    expect(beat).toMatch(/const \{ held, reason \} = await api\.heartbeat/);
    expect(beat).not.toMatch(/unknown/);
  });
});
