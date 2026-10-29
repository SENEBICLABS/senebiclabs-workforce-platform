/**
 * What a pool has for one clinician, decided once.
 *
 * This exists because there were two answers to that question and they
 * disagreed. The pool list counted every task in the project; the queue
 * found out by asking for the next case. A clinician who had worked a pool to
 * the end saw a card reading "in progress" with a button that led straight to
 * "you're all caught up", because the card came from a pool total and the
 * workspace came from what was actually on offer. The pool total was never the
 * clinician's number: it counts cases at their reviewer ceiling, cases they
 * have already judged or flagged, and cases they cannot be served.
 *
 * So the rule lives here, once, and both callers use it. The pool list reads
 * the counts; the queue takes `next` and serves it. They cannot drift, because
 * there is nothing left for them to drift between.
 *
 * Availability, stated once:
 *
 *   a case below the pool's reviewer ceiling, that this clinician has neither
 *   judged nor flagged, that nobody else is reading, plus the held cases they
 *   are senior for
 *
 * with two adjustments for pools that commission written work: an item waiting
 * to be reviewed counts, because it is work and it is served first, and a case
 * somebody has already claimed to author does not.
 *
 * Nothing here reads a database or a network. Everything it needs is passed in,
 * so the rule can be tested against the awkward cases directly — a pool at its
 * ceiling, a senior who read the contested case themselves, a reviewer looking
 * at their own draft — rather than inferred from what a route happened to
 * return.
 */

/** Just enough of a task to decide whether it is still on offer. */
export interface TaskState {
  id: number;
  is_labeled: boolean;
  total_annotations: number;
  /**
   * Readings already spoken for: answers that count, plus the cases somebody is reading
   * right now (HEALTH's migration 009). Absent where holds were not read, and it then
   * falls back to the answer count, which is what this file did before serving began
   * holding cases.
   */
  slots_taken?: number;
  /** True when this clinician holds this case, so it is theirs to finish. */
  mine?: boolean;
}

/** Just enough of a review item to decide whether it is reviewable. */
export interface ReviewableItem {
  ls_task_id: number;
}

export type NextUp<Item extends ReviewableItem = ReviewableItem> =
  | { kind: "held"; lsTaskId: number }
  | { kind: "review"; item: Item }
  | { kind: "task"; lsTaskId: number };

export interface Availability<Item extends ReviewableItem = ReviewableItem> {
  /** Cases this clinician could be served right now. */
  available: number;
  /** Cases still below the ceiling for anybody, which is not the same number. */
  remaining: number;
  /** Nothing left for anyone, or an operator has marked the pool delivered. */
  closed: boolean;
  /**
   * What this clinician would be served next, or null when nothing is.
   *
   * The queue takes this rather than working it out again, which is the point:
   * the number on the card and the case in the workspace come from one
   * decision, so a card offering work always has work behind it.
   */
  next: NextUp<Item> | null;
}

export interface AvailabilityInput<Item extends ReviewableItem = ReviewableItem> {
  tasks: TaskState[];
  /** The pool's reviewer ceiling, or null where it commissions no fixed number. */
  maxAnnotations: number | null;
  /** Cases this clinician has judged or flagged, which are not offered again. */
  seen: Set<number>;
  /** Every case HEALTH is holding for this project, settled or not. */
  heldIds: Set<number>;
  /**
   * Whether that list is worth believing.
   *
   * An unreachable HEALTH sends back the same empty list as a project with no
   * disagreements. Serving can treat the two alike — a senior waits a few
   * seconds for a held case — but "this pool is finished" cannot, because it
   * hides the pool from everybody on the strength of a failed request.
   */
  heldKnown: boolean;
  /** The held cases this clinician may settle. Empty for anyone not senior. */
  settleable: Set<number>;
  /** Whether the pool commissions written work, which changes what counts. */
  authored: boolean;
  /** Items waiting on a reviewer who is not their author. */
  waiting: Item[];
  /** Cases somebody has already claimed to author. */
  claimed: Set<number>;
  /** When an operator marked the pool delivered, or null while it is open. */
  closedAt: string | null;
}

/** A case nobody has filled to the ceiling yet. */
function onOffer(task: TaskState, maxAnnotations: number | null): boolean {
  if (task.is_labeled) return false;
  if (maxAnnotations !== null && task.total_annotations >= maxAnnotations) {
    return false;
  }
  return true;
}

/**
 * The next case for a clinician who is not being served a review or a held
 * case: the lowest-numbered case on offer that they have not judged or flagged,
 * so a pool is worked front-to-back and overlap fills evenly.
 */
/**
 * A case one of whose readings this clinician could actually start now.
 *
 * `onOffer` asks whether a case still needs readings. This asks whether one of them is
 * free. The two came apart when serving began holding cases: a case at its ceiling on
 * held reservations still needs readings and has none to give out, and counting it puts
 * a number on a pool card that the queue cannot honour.
 *
 * It is deliberately not folded into `onOffer`, because `remaining` and `closed` are
 * built from that one and must stay answer-only. A pool whose last cases are being read
 * is busy, not finished, and calling it finished would hide it from everybody for as
 * long as somebody was working in it.
 */
function free(task: TaskState, maxAnnotations: number | null): boolean {
  if (task.mine) return true;
  if (maxAnnotations === null) return true;
  return (task.slots_taken ?? task.total_annotations) < maxAnnotations;
}

export function selectNextTask<Task extends TaskState>(
  tasks: Task[],
  excludeTaskIds: Set<number>,
  maxAnnotations: number | null
): Task | null {
  const available = tasks.filter(
    (task) => !excludeTaskIds.has(task.id) && onOffer(task, maxAnnotations)
  );
  available.sort((a, b) => a.id - b.id);
  return available[0] ?? null;
}

export function decideAvailability<Item extends ReviewableItem>(
  input: AvailabilityInput<Item>
): Availability<Item> {
  const {
    tasks,
    maxAnnotations,
    seen,
    heldIds,
    heldKnown,
    settleable,
    authored,
    waiting,
    claimed,
    closedAt,
  } = input;

  // A held case is not ordinary work, so it is not counted as ordinary work.
  //
  // Excluding it for everyone is not the same as prioritising it for seniors. A
  // case is held because its readings disagree, which is usually also the point
  // at which it has reached its ceiling and drops out of `onOffer` anyway. That
  // is a coincidence, not a rule: a pool commissioning three readings holds a
  // disagreement at two, and there an ordinary clinician would be served the
  // disagreement as fresh work and their reading pulled in as a third, muddying
  // the very split a senior is about to settle.
  const open = tasks.filter(
    (task) => onOffer(task, maxAnnotations) && !heldIds.has(task.id)
  );

  // Still below the ceiling for somebody. This is not the clinician's number
  // and is never shown to them; it is what decides whether a pool is finished.
  const remaining = open.length;

  let unclaimed = open.filter((task) => !seen.has(task.id) && free(task, maxAnnotations));

  // Only a flag hides an item from a reviewer. A completion must not: a
  // reviewer who sent work back should see the rewrite and judge whether their
  // objection was met, and their pay is deduped by the completion index rather
  // than by hiding the item.
  const reviewable = authored
    ? waiting.filter((item) => !seen.has(item.ls_task_id))
    : [];

  if (authored) unclaimed = unclaimed.filter((task) => !claimed.has(task.id));

  // Written work is authored once and approved once. Reviewing is served ahead
  // of authoring, so finished drafts do not queue up behind new ones — and a
  // disagreement waiting on a decision is served ahead of both, because it is
  // the most valuable thing in the pool and the only person who can clear it is
  // already here.
  const firstHeld = [...settleable].sort((a, b) => a - b)[0];
  // A case they are already holding comes first, so a reload resumes it rather than
  // queueing behind a lower-numbered case somebody else is reading. The reservation would
  // resume it anyway; agreeing here keeps the count, the card and the queue telling one
  // story.
  const firstTask = [...unclaimed].sort(
    (a, b) => Number(Boolean(b.mine)) - Number(Boolean(a.mine)) || a.id - b.id
  )[0];

  const next: NextUp<Item> | null =
    firstHeld !== undefined
      ? { kind: "held", lsTaskId: firstHeld }
      : reviewable[0]
        ? { kind: "review", item: reviewable[0] }
        : firstTask
          ? { kind: "task", lsTaskId: firstTask.id }
          : null;

  // Held cases count toward what a senior can do, and toward nobody else's.
  const available = unclaimed.length + reviewable.length + settleable.size;

  // Two ways a pool is finished, and they are not the same fact. Nothing left
  // below the ceiling and nothing still held means the work is done, and anyone
  // can see that — but only where the held list was actually read, or a HEALTH
  // outage would close every pool on the platform at once. Delivered is an
  // operator's statement about a project that has gone downstream, which no
  // count can tell you and which survives any outage, because we hold it.
  const closed =
    closedAt !== null || (heldKnown && remaining === 0 && heldIds.size === 0);

  return { available, remaining, closed, next };
}
