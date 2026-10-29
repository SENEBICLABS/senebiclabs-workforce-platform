import "server-only";
import { supabaseAdmin } from "./supabase";
import { renderTaskData } from "./render";
import type { TaskState } from "./availability-rules";
import type { LsResultEntry } from "./eval-config";

/**
 * The task store: Senebiclabs' own tasks and answers, in the shared database.
 * Every pool's tasks are its HEALTH project's items.
 *
 * Every write is one database function, so an answer, the completion that
 * records the work, and the event that tells HEALTH to score it commit together
 * or not at all. There is nothing to roll back by hand. The functions and their guarantees are in HEALTH's migrations/005 and are tested
 * against Postgres in HEALTH's tests/sql.
 *
 * Task numbers start at a billion (HEALTH migration 005 enforces it), so
 * anything below that is not a task and is answered without a query.
 */

export const TASK_NO_FLOOR = 1_000_000_000;

export function isTaskNumber(id: number): boolean {
  return Number.isInteger(id) && id >= TASK_NO_FLOOR;
}

export class TaskStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskStoreError";
  }
}

export interface NativeTask {
  id: number;
  projectId: string;
  status: string;
  /** Rendered, internal keys removed: exactly what a clinician may read. */
  data: Record<string, unknown>;
  /** The stored content, for the media route only. Never sent to a browser. */
  content: Record<string, unknown>;
}

/** One task by number, or null if there is no such task. */
export async function getNativeTask(taskNo: number): Promise<NativeTask | null> {
  if (!isTaskNumber(taskNo)) return null;
  const { data, error } = await supabaseAdmin
    .from("project_items")
    .select("task_no, project_id, status, content")
    .eq("task_no", taskNo)
    .maybeSingle();
  if (error) throw new TaskStoreError(`task ${taskNo}: ${error.code ?? error.message}`);
  if (!data) return null;
  const content = (data.content ?? {}) as Record<string, unknown>;
  return {
    id: Number(data.task_no),
    projectId: String(data.project_id),
    status: String(data.status),
    data: renderTaskData(content),
    content,
  };
}

/** Every released task's state, in the shape the availability rule takes. */
export async function nativeTaskStates(projectId: string): Promise<TaskState[]> {
  const { data, error } = await supabaseAdmin.rpc("native_task_states", {
    p_project: projectId,
  });
  if (error) throw new TaskStoreError(`task states: ${error.code ?? error.message}`);
  return ((data ?? []) as { task_no: number; total_annotations: number; is_labeled: boolean }[]).map(
    (row) => ({
      id: Number(row.task_no),
      total_annotations: Number(row.total_annotations ?? 0),
      is_labeled: Boolean(row.is_labeled),
    })
  );
}

/** How many tasks have been released to clinicians, for the operator console. */
export async function countNativeTasks(projectId: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from("project_items")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .neq("status", "pending");
  return error ? null : (count ?? 0);
}

export type SubmitOutcome =
  | "claimed"
  | "already"
  | "full"
  | "settled"
  | "closed"
  | "unavailable"
  | "wrong_phase"
  | "invalid"
  | "not_found";

/**
 * Records one judgement. The function re-checks everything the route checked
 * (eligibility, the pool's project, the ceiling) under a lock on the task, so
 * a request that slipped past a stale check is still refused here.
 */
export async function submitJudgement(input: {
  clinicianId: string;
  poolId: string;
  taskNo: number;
  result: LsResultEntry[];
  answers: Record<string, unknown>;
}): Promise<SubmitOutcome> {
  const { data, error } = await supabaseAdmin.rpc("native_submit_judgement", {
    p_clinician_id: input.clinicianId,
    p_pool_id: input.poolId,
    p_task_no: input.taskNo,
    p_result: input.result,
    p_answers: input.answers,
  });
  if (error) throw new TaskStoreError(`submit: ${error.code ?? error.message}`);
  return data as SubmitOutcome;
}

export type ApproveOutcome =
  | "approved"
  | "conflict"
  | "own_work"
  | "closed"
  | "invalid"
  | "not_found";

/** Publishes an approved piece of authored work, in one transaction. */
export async function approveReview(input: {
  reviewItemId: string;
  reviewerId: string;
  action: "approved" | "edited";
  finalData: Record<string, unknown>;
  result: LsResultEntry[];
}): Promise<ApproveOutcome> {
  const { data, error } = await supabaseAdmin.rpc("native_approve_review", {
    p_review_item_id: input.reviewItemId,
    p_reviewer_id: input.reviewerId,
    p_action: input.action,
    p_final: input.finalData,
    p_result: input.result,
  });
  if (error) throw new TaskStoreError(`approve: ${error.code ?? error.message}`);
  return data as ApproveOutcome;
}

// ── Reservations (HEALTH migration 009) ─────────────────────────────────────────
//
// A case is held from the moment it is served, not from the moment an answer arrives.
// Before this, serving returned the lowest open case and recorded nothing, so everyone
// asking at the same moment was handed the same one and all but a few had their
// submission refused after they had already read it and formed a judgement.
//
// Every rule lives in the database: which case is eligible, how many readings it still
// needs, and how long a hold lasts. These functions are thin, and deliberately so,
// because a second copy of those rules here is what the whole change removes.

export interface Reservation {
  taskNo: number;
  itemId: string;
  /** The version of the case they were shown. A re-upload invalidates the hold. */
  itemVersion: number;
  expiresAt: string;
}

/** The shape `reserve_next_item` and `reserve_adjudication` both return. */
interface ReservationRow {
  task_no: number;
  item_id: string;
  item_version: number;
  expires_at: string;
}

function asReservation(data: unknown): Reservation | null {
  const row = ((data ?? []) as ReservationRow[])[0];
  if (!row) return null;
  return {
    taskNo: Number(row.task_no),
    itemId: String(row.item_id),
    itemVersion: Number(row.item_version),
    expiresAt: String(row.expires_at),
  };
}

/**
 * Holds the next case for this clinician and returns it, or null when there is
 * nothing they can be served.
 *
 * Asking twice returns the same case: the hold is theirs until they answer it, give it
 * back, or it lapses, so a reload resumes rather than drawing a second case and leaving
 * the first held. Which case, and whether a reading is free, is decided under a lock on
 * the case's own row, so two clinicians asking together are never handed one case.
 *
 * Null means no work, which is a resting state. A failure to reach the store throws,
 * because "nothing to do" and "we could not ask" mean opposite things to a clinician and
 * a caller must not be able to confuse them.
 */
export async function reserveNextItem(input: {
  clinicianId: string;
  poolId: string;
  leaseMinutes?: number;
}): Promise<Reservation | null> {
  const { data, error } = await supabaseAdmin.rpc("reserve_next_item", {
    p_clinician_id: input.clinicianId,
    p_pool_id: input.poolId,
    p_lease_minutes: input.leaseMinutes ?? 60,
  });
  if (error) throw new TaskStoreError(`reserve: ${error.code ?? error.message}`);
  return asReservation(data);
}

/**
 * Assigns a held case to this senior, if there is one for them to settle.
 *
 * A held case sits at its reviewer ceiling by definition, so `reserveNextItem` refuses it
 * and it needs its own assignment. One senior settles a case and that decision is final
 * (`task_completions_one_adjudication`), so this hands it to one of them at a time. A
 * senior who abandons it holds it only until the lease lapses.
 *
 * Null deliberately does not say which reason applies: not held, already settled, held by
 * another senior, their own earlier reading, or they are not senior in this pool.
 */
export async function reserveAdjudication(input: {
  clinicianId: string;
  poolId: string;
  leaseMinutes?: number;
}): Promise<Reservation | null> {
  const { data, error } = await supabaseAdmin.rpc("reserve_adjudication", {
    p_clinician_id: input.clinicianId,
    p_pool_id: input.poolId,
    p_lease_minutes: input.leaseMinutes ?? 60,
  });
  if (error) throw new TaskStoreError(`adjudication: ${error.code ?? error.message}`);
  return asReservation(data);
}

export type RenewOutcome =
  | "renewed"
  | "not_found"
  | "expired"
  | "limit_reached"
  | "too_old"
  | "stale"
  | "invalid";

/**
 * Extends the hold on a case a clinician is still reading.
 *
 * This one throws, unlike the three below it. The caller is a clinician's own request and
 * the answer matters to them: a heartbeat that could not reach the database must not be
 * reported as a successful renewal, or they would carry on reading a case that is about
 * to be handed to somebody else.
 *
 * Every bound is the database's. The renewal count is what binds in practice: a renewal
 * is refused once the lease has expired, so each one adds at most one lease length, and
 * four of them reach five hours.
 */
export async function renewReservation(input: {
  clinicianId: string;
  taskNo: number;
  leaseMinutes?: number;
  maxRenewals?: number;
  maxTotalMinutes?: number;
}): Promise<RenewOutcome> {
  const { data, error } = await supabaseAdmin.rpc("renew_reservation", {
    p_clinician_id: input.clinicianId,
    p_task_no: input.taskNo,
    p_lease_minutes: input.leaseMinutes ?? 60,
    p_max_renewals: input.maxRenewals ?? 4,
    p_max_total_minutes: input.maxTotalMinutes ?? 480,
  });
  if (error) throw new TaskStoreError(`renew: ${error.code ?? error.message}`);
  return data as RenewOutcome;
}

/**
 * Marks a hold spent once its answer is recorded.
 *
 * Deliberately does not throw. The ceiling never depended on it: a hold whose owner has
 * answered already stops counting against the case, so a lost call here tidies nothing
 * and breaks nothing.
 */
export async function settleReservation(clinicianId: string, taskNo: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("settle_reservation", {
    p_clinician_id: clinicianId,
    p_task_no: taskNo,
  });
  if (error) {
    console.error(`[taskstore] hold on task ${taskNo} not settled: ${error.code ?? error.message}`);
  }
}

/**
 * Gives a case back without answering it: a flag, a skip, a sign-out.
 *
 * Also does not throw. The flag or the pass is the clinician's statement and is already
 * recorded; failing their request because the hold would not tidy would undo work they
 * did. The case frees itself when the lease lapses.
 */
export async function releaseReservation(
  clinicianId: string,
  taskNo: number,
  reason: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("release_reservation", {
    p_clinician_id: clinicianId,
    p_task_no: taskNo,
    p_reason: reason,
  });
  if (error) {
    console.error(`[taskstore] hold on task ${taskNo} not released: ${error.code ?? error.message}`);
  }
}

/**
 * Per released case: the readings already spoken for, and whether this clinician is the
 * one holding one.
 *
 * The pool card is counted from this so the card and the queue cannot disagree. A card
 * saying work is waiting while every free reading is being done sends a clinician to an
 * empty queue, which is the same mistake as serving one case to five people.
 */
export async function itemLeaseStates(
  projectId: string,
  clinicianId: string
): Promise<Map<number, { slotsTaken: number; mine: boolean }>> {
  const { data, error } = await supabaseAdmin.rpc("item_lease_states", {
    p_project: projectId,
    p_clinician: clinicianId,
  });
  if (error) throw new TaskStoreError(`lease states: ${error.code ?? error.message}`);
  const out = new Map<number, { slotsTaken: number; mine: boolean }>();
  for (const row of (data ?? []) as { task_no: number; slots_taken: number; mine: boolean }[]) {
    out.set(Number(row.task_no), {
      slotsTaken: Number(row.slots_taken ?? 0),
      mine: Boolean(row.mine),
    });
  }
  return out;
}
