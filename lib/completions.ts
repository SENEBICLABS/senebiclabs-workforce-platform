import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * The record of work done, one row per pass.
 *
 * A clinician can make five kinds of pass over a case, and every one of them is
 * work somebody should be paid for:
 *
 *   judgement     read the case and the model's answer, and assess it
 *   flag          read the case and say, honestly, that you cannot judge it
 *   authoring     write the answer a clinician should receive
 *   review        read a colleague's draft and approve, edit or send it back
 *   adjudication  settle a case two clinicians read differently
 *
 * Only the first, third and fourth used to leave a row. Flagging left nothing,
 * so the one pass that depends entirely on a clinician's honesty was the one
 * the platform forgot. Whatever pay is built later reads this table, and it can
 * only pay for what was written down at the time.
 *
 * Nothing here knows about money. A kind is a fact about what happened; a rate
 * is a decision taken later and applied to these rows.
 */

export const PASS_KINDS = [
  "judgement",
  "flag",
  "authoring",
  "review",
  "adjudication",
] as const;
export type PassKind = (typeof PASS_KINDS)[number];

/**
 * The kinds that count as a reading of the case.
 *
 * Everywhere a number is shown as "reviewed", or compared against how many
 * cases a pool holds, it means these. A flag is a pass and is paid, but it is
 * not a reading: counting it would tell a clinician they had reviewed cases
 * they had explicitly declined to judge, and would tell a client a case had
 * been read when it had not.
 *
 * An adjudication is left out for a different reason. It is certainly a reading
 * — a senior reads the case and decides it — but it is a second pass over a
 * case already read to its ceiling, and every consumer of this list treats one
 * entry as one case read once. Counting it would make a pool look further
 * through than it is, and would show reconcile a completion with no Label
 * Studio annotation behind it, because a senior's decision goes to HEALTH
 * rather than to Label Studio. It is counted as its own kind on the work
 * record, which is where a clinician looks for what they are owed.
 */
export const READING_KINDS: PassKind[] = ["judgement", "authoring", "review"];

/** For a PostgREST `.in()` filter, which wants the list as given. */
export const READINGS_ONLY = READING_KINDS;

/**
 * Records one pass.
 *
 * Returns true when a row exists for this clinician, case and kind afterwards,
 * whether this call wrote it or an earlier one did. 23505 is not a failure: it
 * is the unique index doing its job, and it means the same clinician has
 * already been recorded for this kind of pass on this case. A reviewer who
 * sends a draft back and later approves the rewrite gets one row, not two, and
 * an author who rewrites after a send-back likewise.
 *
 * Deliberately never throws. A pass that cannot be recorded must not take the
 * clinician's work down with it; the caller decides what to do, and every
 * caller logs it.
 */
export async function recordPass(pass: {
  clinicianId: string;
  poolId: string;
  taskId: number;
  kind: PassKind;
  data?: unknown;
}): Promise<{ ok: boolean; duplicate: boolean }> {
  const { error } = await supabaseAdmin.from("task_completions").insert({
    clinician_id: pass.clinicianId,
    pool_id: pass.poolId,
    ls_task_id: pass.taskId,
    annotation_data: pass.data ?? null,
    kind: pass.kind,
  });

  if (!error) return { ok: true, duplicate: false };
  if (error.code === "23505") return { ok: true, duplicate: true };

  console.error(`[completions] could not record a ${pass.kind} pass`, error);
  return { ok: false, duplicate: false };
}
