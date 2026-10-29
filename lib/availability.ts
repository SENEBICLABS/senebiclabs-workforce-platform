import "server-only";
import { supabaseAdmin } from "./supabase";
import { READINGS_ONLY } from "./completions";
import { heldSnapshot } from "./health";
import { itemLeaseStates, nativeTaskStates } from "./taskstore";
import {
  claimedTaskIds,
  itemsAwaitingReview,
  reviewRequired,
  type ReviewItem,
} from "./review";
import type { RawEvalConfig } from "./eval-config";
import {
  decideAvailability,
  type Availability,
  type TaskState,
} from "./availability-rules";

/**
 * Gathers what the availability rule needs, and applies it.
 *
 * The rule itself is in ./availability-rules and knows nothing about databases:
 * everything below is the reading, and the decision is made in one place that
 * both the pool list and the queue call. See that file for what availability
 * means and why it had to stop being computed twice.
 */

export type PoolAvailability = Omit<Availability<ReviewItem>, "available" | "remaining"> & {
  /**
   * Cases this clinician could be served, or null when it could not be read.
   *
   * Null is not zero and must never be shown as one. When the task store
   * cannot be read the honest answer is that we do not know what is left —
   * telling a clinician "no cases available" would send them away from a pool
   * that is full of work.
   */
  available: number | null;
  remaining: number | null;
  /** True when the figures above are missing because a read failed. */
  degraded: boolean;
  /** Cases they have read here. Readings only: a flag is a pass, not a reading. */
  completed: number;
};

/** A pool's own facts, whether or not a clinician is in the picture. */
export interface PoolFacts {
  id: string;
  maxAnnotations: number | null;
  evalConfig: Record<string, unknown> | null;
  senior: boolean;
  closedAt: string | null;
  projectId: string;
}

/**
 * The passes and flags that put a case out of this clinician's reach.
 *
 * Flags and completions both mean "do not offer this to them again", and they
 * live in different tables because they mean different things to everyone else:
 * a completion is work done, a flag is a routing fact. A missing flags table is
 * treated as no flags rather than an error, because flagging is optional
 * infrastructure and must never break serving.
 */
async function ownedBy(clinicianId: string, poolId: string) {
  const [{ data: completions }, { data: flags }] = await Promise.all([
    supabaseAdmin
      .from("task_completions")
      .select("ls_task_id, kind")
      .eq("clinician_id", clinicianId)
      .eq("pool_id", poolId),
    supabaseAdmin
      .from("task_flags")
      .select("ls_task_id")
      .eq("clinician_id", clinicianId)
      .eq("pool_id", poolId),
  ]);

  const seen = new Set<number>();
  for (const row of flags ?? []) seen.add(row.ls_task_id as number);
  for (const row of completions ?? []) seen.add(row.ls_task_id as number);

  const completed = (completions ?? []).filter((row) =>
    READINGS_ONLY.includes(row.kind as (typeof READINGS_ONLY)[number])
  ).length;

  return { seen, completed };
}

/**
 * Which held cases this senior may settle.
 *
 * Both exclusions are asked by case rather than by pool. A senior must never
 * settle a disagreement they are part of, and the only record of who read what
 * is this table: HEALTH sends the earlier answers with no author, deliberately,
 * so it cannot be asked and must not be inferred. A case is a case whichever
 * pool row served it, and the database already takes that view: a reading is
 * unique per (clinician, task, kind) with no pool in it, and one adjudication
 * per case is unique on the task alone.
 *
 * Finding none is a resting state, not a failure. A case whose every senior has
 * already read it stays held for an operator to settle through HEALTH's own
 * review path, which is better than a decision by someone who has already
 * formed a view.
 */
async function settleableBy(
  clinicianId: string,
  heldIds: number[]
): Promise<Set<number>> {
  if (heldIds.length === 0) return new Set();

  const [{ data: settled }, { data: alreadyRead }] = await Promise.all([
    supabaseAdmin
      .from("task_completions")
      .select("ls_task_id")
      .eq("kind", "adjudication")
      .in("ls_task_id", heldIds),
    supabaseAdmin
      .from("task_completions")
      .select("ls_task_id")
      .eq("clinician_id", clinicianId)
      .in("ls_task_id", heldIds),
  ]);

  const out = new Set(heldIds);
  for (const row of settled ?? []) out.delete(row.ls_task_id as number);
  for (const row of alreadyRead ?? []) out.delete(row.ls_task_id as number);
  return out;
}

export async function availabilityFor(
  pool: PoolFacts,
  clinicianId: string
): Promise<PoolAvailability> {
  const raw = pool.evalConfig as RawEvalConfig | null;
  const authored = reviewRequired(raw);

  // The clinician's own passes are not allowed to fail quietly; the project's
  // task states are, and are reported as unknown rather than as none.
  const [tasks, owned, held] = await Promise.all([
    nativeTaskStates(pool.projectId).catch((err) => {
      console.error(`[availability] could not read tasks for pool ${pool.id}`, err);
      return null;
    }),
    ownedBy(clinicianId, pool.id),
    heldSnapshot(pool),
  ]);

  if (tasks === null) {
    return {
      available: null,
      remaining: null,
      degraded: true,
      // Delivered is a fact we hold separately, so it survives the task states
      // being unreadable. "Finished" is a count, and counts are gone.
      closed: pool.closedAt !== null,
      next: null,
      completed: owned.completed,
    };
  }

  // What the queue will honour, so the card and the queue are counted the same way.
  // Failing to read the holds is not fatal: without them a card can overstate by the
  // number of cases being read right now, which is a smaller wrong than showing a busy
  // pool as empty.
  let withLeases: TaskState[] = tasks;
  const leases = await itemLeaseStates(pool.projectId, clinicianId).catch((err) => {
    console.error(`[availability] could not read holds for pool ${pool.id}`, err);
    return null;
  });
  if (leases) {
    withLeases = tasks.map((task) => {
      const lease = leases.get(task.id);
      return lease ? { ...task, slots_taken: lease.slotsTaken, mine: lease.mine } : task;
    });
  }

  const heldIds = new Set(held.cases.map((c) => c.ls_task_id));

  const [settleable, waiting, claimed] = await Promise.all([
    pool.senior ? settleableBy(clinicianId, [...heldIds]) : new Set<number>(),
    authored ? itemsAwaitingReview(pool.id, clinicianId) : [],
    authored ? claimedTaskIds(pool.id) : new Set<number>(),
  ]);

  const decided = decideAvailability<ReviewItem>({
    tasks: withLeases,
    maxAnnotations: pool.maxAnnotations,
    seen: owned.seen,
    heldIds,
    heldKnown: held.known,
    settleable,
    authored,
    waiting,
    claimed,
    closedAt: pool.closedAt,
  });

  return { ...decided, degraded: false, completed: owned.completed };
}
