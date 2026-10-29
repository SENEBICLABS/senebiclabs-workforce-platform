import { describe, expect, it } from "vitest";
import {
  decideAvailability,
  type AvailabilityInput,
  type TaskState,
} from "../lib/availability-rules";

/**
 * The rule the pool card and the queue both read.
 *
 * They used to answer this question separately and disagree: a pool worked to
 * the end showed "in progress" with a button that led straight to "you're all
 * caught up". So the case that matters most here is the boring one — a pool at
 * its ceiling has nothing available and nothing to serve — and the rest are the
 * ways a case can be present in a project and still not be work for this
 * person.
 */

const task = (id: number, annotations = 0, labeled = false): TaskState => ({
  id,
  is_labeled: labeled,
  total_annotations: annotations,
});

const ask = (over: Partial<AvailabilityInput> = {}) =>
  decideAvailability({
    tasks: [task(1), task(2), task(3)],
    maxAnnotations: 2,
    seen: new Set(),
    heldIds: new Set(),
    heldKnown: true,
    settleable: new Set(),
    authored: false,
    waiting: [],
    claimed: new Set(),
    closedAt: null,
    ...over,
  });

describe("an ordinary pool", () => {
  it("offers every case nobody has filled", () => {
    const decision = ask();
    expect(decision.available).toBe(3);
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 1 });
  });

  it("works front to back, lowest id first", () => {
    expect(ask({ seen: new Set([1]) }).next).toEqual({ kind: "task", lsTaskId: 2 });
  });

  it("does not offer a case this clinician has already judged or flagged", () => {
    const decision = ask({ seen: new Set([1, 2]) });
    expect(decision.available).toBe(1);
  });

  it("does not offer a case that has reached the reviewer ceiling", () => {
    const decision = ask({ tasks: [task(1, 2), task(2, 1), task(3, 2)] });
    expect(decision.available).toBe(1);
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 2 });
  });

  it("does not offer a case already marked finished", () => {
    expect(ask({ tasks: [task(1, 0, true), task(2)] }).available).toBe(1);
  });

  it("offers everything when the pool commissions no fixed number", () => {
    const decision = ask({ tasks: [task(1, 9), task(2, 40)], maxAnnotations: null });
    expect(decision.available).toBe(2);
  });
});

/** The bug this rule was written for. */
describe("a pool the clinician has worked to the end", () => {
  const finished = ask({ tasks: [task(1, 2), task(2, 2)], seen: new Set([1, 2]) });

  it("has nothing available", () => {
    expect(finished.available).toBe(0);
  });

  it("has nothing to serve, so no card can offer a button that leads nowhere", () => {
    expect(finished.next).toBeNull();
  });

  it("is closed, because nothing is left for anybody", () => {
    expect(finished.closed).toBe(true);
  });
});

describe("a pool the clinician has finished but others have not", () => {
  const mine = ask({ tasks: [task(1, 2), task(2, 1)], seen: new Set([1, 2]) });

  it("has nothing available to them", () => {
    expect(mine.available).toBe(0);
  });

  it("is not closed, because a case is still below the ceiling", () => {
    expect(mine.closed).toBe(false);
    expect(mine.remaining).toBe(1);
  });
});

describe("held cases", () => {
  const held = { heldIds: new Set([2]), tasks: [task(1), task(2, 1), task(3)] };

  it("are not offered as ordinary work, even below the ceiling", () => {
    const decision = ask(held);
    expect(decision.available).toBe(2);
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 1 });
  });

  it("count for a senior who may settle them", () => {
    const decision = ask({ ...held, settleable: new Set([2]) });
    expect(decision.available).toBe(3);
  });

  it("are served to that senior before anything else", () => {
    const decision = ask({ ...held, settleable: new Set([2]) });
    expect(decision.next).toEqual({ kind: "held", lsTaskId: 2 });
  });

  it("do not count for a senior who read the case themselves", () => {
    // settleable is empty because the caller excluded it; the rule must not
    // put it back by noticing they are senior.
    const decision = ask({ ...held, settleable: new Set() });
    expect(decision.available).toBe(2);
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 1 });
  });

  it("keep a drained pool open, because the disagreement is still work", () => {
    const decision = ask({
      tasks: [task(1, 2), task(2, 2)],
      heldIds: new Set([2]),
      seen: new Set([1, 2]),
    });
    expect(decision.closed).toBe(false);
  });
});

describe("a pool that commissions written work", () => {
  const authored = {
    authored: true,
    tasks: [task(1), task(2), task(3)],
  };

  it("counts an item waiting to be reviewed", () => {
    const decision = ask({
      ...authored,
      waiting: [{ ls_task_id: 9 }],
      claimed: new Set([9]),
    });
    expect(decision.available).toBe(4);
  });

  it("serves the review before authoring anything new", () => {
    const decision = ask({
      ...authored,
      waiting: [{ ls_task_id: 9 }],
      claimed: new Set([9]),
    });
    expect(decision.next).toEqual({ kind: "review", item: { ls_task_id: 9 } });
  });

  it("does not offer a case somebody has already claimed to author", () => {
    const decision = ask({ ...authored, claimed: new Set([1, 2]) });
    expect(decision.available).toBe(1);
  });

  it("hides a review item this clinician flagged, and only a flag hides it", () => {
    const decision = ask({
      ...authored,
      waiting: [{ ls_task_id: 9 }],
      claimed: new Set([9]),
      seen: new Set([9]),
    });
    expect(decision.available).toBe(3);
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 1 });
  });

  it("ignores review items entirely when the pool does not commission writing", () => {
    // A stale review_items row must not conjure work in a single-phase pool.
    const decision = ask({ authored: false, waiting: [{ ls_task_id: 9 }] });
    expect(decision.available).toBe(3);
  });
});

describe("a pool an operator has closed", () => {
  const closed = ask({ closedAt: "2026-09-30T09:00:00Z" });

  it("is closed however much work is left in it", () => {
    expect(closed.closed).toBe(true);
    expect(closed.remaining).toBe(3);
  });

  it("still reports what would have been available, which the route refuses", () => {
    // The rule states the facts; refusing to serve a closed pool is the
    // route's job, and keeping the count honest here means a closure can be
    // undone without recomputing anything.
    expect(closed.available).toBe(3);
  });
});

describe("when HEALTH could not be asked", () => {
  it("never calls a pool finished on the strength of a failed request", () => {
    // Identical to the finished case above, except that the empty held list
    // came from an outage. One unreachable service must not close every pool.
    const decision = ask({
      tasks: [task(1, 2), task(2, 2)],
      seen: new Set([1, 2]),
      heldKnown: false,
    });
    expect(decision.remaining).toBe(0);
    expect(decision.closed).toBe(false);
  });

  it("still honours a closure an operator made, which we hold ourselves", () => {
    const decision = ask({ heldKnown: false, closedAt: "2026-09-30T09:00:00Z" });
    expect(decision.closed).toBe(true);
  });
});

describe("the two counts are not the same number", () => {
  it("remaining ignores this clinician, available does not", () => {
    const decision = ask({ tasks: [task(1), task(2), task(3)], seen: new Set([1, 2]) });
    expect(decision.remaining).toBe(3);
    expect(decision.available).toBe(1);
  });
});

describe("a case somebody else is already reading", () => {
  // `slots_taken` is answers plus live holds (HEALTH migration 009). A case at its
  // ceiling on holds still needs readings and has none to give out, so counting it would
  // put a number on a pool card that the queue cannot honour.
  const holding = (id: number, slotsTaken: number, mine = false): TaskState => ({
    ...task(id, 0),
    slots_taken: slotsTaken,
    mine,
  });

  it("is not offered, and is not counted", () => {
    const decision = ask({ tasks: [holding(1, 2), holding(2, 0), holding(3, 2)] });
    expect(decision.available).toBe(1);
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 2 });
  });

  it("still counts as remaining, because the pool is busy rather than finished", () => {
    // `remaining` and `closed` stay answer-only on purpose: a pool whose last cases are
    // being read must not be hidden from everybody while somebody is working in it.
    const decision = ask({ tasks: [holding(1, 2), holding(2, 2)] });
    expect(decision.available).toBe(0);
    expect(decision.remaining).toBe(2);
    expect(decision.closed).toBe(false);
    expect(decision.next).toBeNull();
  });

  it("is offered to the clinician who is holding it, ahead of a lower-numbered case", () => {
    // A reload must resume their case rather than queueing behind one somebody else has.
    const decision = ask({ tasks: [holding(1, 2), holding(2, 2, true), holding(3, 0)] });
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 2 });
    expect(decision.available).toBe(2);
  });

  it("falls back to the answer count when holds could not be read", () => {
    // itemLeaseStates failing must not empty a pool: without slots_taken the rule behaves
    // exactly as it did before serving began holding cases.
    const decision = ask({ tasks: [task(1, 2), task(2, 1), task(3, 0)] });
    expect(decision.available).toBe(2);
    expect(decision.next).toEqual({ kind: "task", lsTaskId: 2 });
  });

  it("ignores holds where the pool commissions no fixed number of readings", () => {
    const decision = ask({ tasks: [holding(1, 9), holding(2, 40)], maxAnnotations: null });
    expect(decision.available).toBe(2);
  });
});
