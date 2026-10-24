import "server-only";
import { supabaseAdmin } from "./supabase";
import { renderTaskData } from "./render";
import type { TaskState } from "./availability-rules";
import type { LsResultEntry } from "./eval-config";

/**
 * The native task store: Senebiclabs' own tasks and answers, in the shared
 * database. It replaces Label Studio for pools whose project has moved to it
 * (HEALTH's project_submissions.task_store = 'native').
 *
 * Every write is one database function, so an answer, the completion that
 * records the work, and the event that tells HEALTH to score it commit together
 * or not at all. There is nothing to roll back by hand, which is why none of
 * the compensating deletes the Label Studio path needs appear here. The
 * functions and their guarantees are in HEALTH's migrations/005 and are tested
 * against Postgres in HEALTH's tests/sql.
 *
 * Task numbers start at a billion. Label Studio's ids sit below that, so any
 * route holding only a task id can tell which store it belongs to.
 */

export const NATIVE_TASK_FLOOR = 1_000_000_000;

export function isNativeTaskId(id: number): boolean {
  return Number.isInteger(id) && id >= NATIVE_TASK_FLOOR;
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
  if (!isNativeTaskId(taskNo)) return null;
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
