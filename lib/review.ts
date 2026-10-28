import "server-only";
import { supabaseAdmin } from "./supabase";
import type { RawEvalConfig } from "./eval-config";

/**
 * Author → reviewer flow for written work.
 *
 * Written answers are authored once and approved once. The approved text is
 * delivered verbatim — never merged with another version, because two good
 * answers to the same prompt are not votes.
 *
 * Drafts live here, apart from the answers of record. An answer is written
 * when a reviewer approves (lib/taskstore approveReview), so a project's
 * webhook only ever delivers approved prose.
 */

export type ReviewState =
  | "needs_author"
  | "needs_review"
  | "approved"
  | "rejected";

export type ReviewAction = "approved" | "edited" | "rejected";

export interface ReviewItem {
  id: string;
  pool_id: string;
  ls_task_id: number;
  state: ReviewState;
  author_id: string | null;
  authored_at: string | null;
  authored_data: Record<string, unknown> | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
  review_action: ReviewAction | null;
  reject_reason: string | null;
  final_data: Record<string, unknown> | null;
  ls_annotation_id: number | null;
  revision: number;
}

/** Whether a pool's config asks for the two-phase flow. */
export function reviewRequired(raw: RawEvalConfig | null): boolean {
  return (raw as { review_required?: unknown } | null)?.review_required === true;
}

/**
 * Items in a pool that are waiting for a reviewer who is not their author.
 *
 * This is the authority behind "author ≠ reviewer": the filter excludes the
 * caller's own work in the query, so their own item is never a candidate to
 * begin with rather than being filtered out later.
 */
export async function itemsAwaitingReview(
  poolId: string,
  reviewerId: string
): Promise<ReviewItem[]> {
  const { data } = await supabaseAdmin
    .from("review_items")
    .select("*")
    .eq("pool_id", poolId)
    .eq("state", "needs_review")
    .neq("author_id", reviewerId)
    .order("authored_at", { ascending: true });

  return (data ?? []) as ReviewItem[];
}

/** Task ids in this pool that are already authored, whatever their state. */
export async function claimedTaskIds(poolId: string): Promise<Set<number>> {
  const { data } = await supabaseAdmin
    .from("review_items")
    .select("ls_task_id, state")
    .eq("pool_id", poolId)
    .in("state", ["needs_review", "approved"]);

  return new Set((data ?? []).map((r) => r.ls_task_id as number));
}

export async function loadItem(
  poolId: string,
  lsTaskId: number
): Promise<ReviewItem | null> {
  const { data } = await supabaseAdmin
    .from("review_items")
    .select("*")
    .eq("pool_id", poolId)
    .eq("ls_task_id", lsTaskId)
    .maybeSingle();

  return (data as ReviewItem | null) ?? null;
}

/**
 * Records an authored draft and moves the item to needs_review.
 *
 * Conditional on the item still being unauthored, so two clinicians submitting
 * the same task cannot both claim authorship — the loser is told to move on.
 */
export async function recordAuthored(
  poolId: string,
  lsTaskId: number,
  authorId: string,
  answers: Record<string, unknown>
): Promise<{ ok: true; item: ReviewItem } | { ok: false; reason: "taken" }> {
  const existing = await loadItem(poolId, lsTaskId);

  const patch = {
    state: "needs_review" as const,
    author_id: authorId,
    authored_at: new Date().toISOString(),
    authored_data: answers,
    reviewer_id: null,
    reviewed_at: null,
    review_action: null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    // Only an item nobody has authored (fresh, or sent back) may be claimed.
    if (existing.state !== "needs_author") return { ok: false, reason: "taken" };

    const { data } = await supabaseAdmin
      .from("review_items")
      .update(patch)
      .eq("id", existing.id)
      .eq("state", "needs_author")
      .select("*");

    if (!data?.length) return { ok: false, reason: "taken" };
    return { ok: true, item: data[0] as ReviewItem };
  }

  const { data, error } = await supabaseAdmin
    .from("review_items")
    .insert({ pool_id: poolId, ls_task_id: lsTaskId, ...patch })
    .select("*")
    .single();

  // 23505 means someone inserted first; theirs stands.
  if (error) return { ok: false, reason: "taken" };
  return { ok: true, item: data as ReviewItem };
}

/**
 * Sends an item back to be authored again.
 *
 * The rejected draft is cleared rather than kept: the next author should write
 * from the prompt, not edit around a reviewer's objection. The reason and the
 * revision count survive so a loop is visible.
 */
export async function recordRejected(
  item: ReviewItem,
  reviewerId: string,
  reason: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("review_items")
    .update({
      state: "needs_author",
      reviewer_id: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_action: "rejected",
      reject_reason: reason,
      author_id: null,
      authored_data: null,
      authored_at: null,
      revision: item.revision + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", item.id)
    .eq("state", "needs_review")
    .select("id");

  return (data?.length ?? 0) > 0;
}

/** The free-text fields of a config — what a review pass is actually about. */
export function writtenFieldNames(fields: { name: string; type: string }[]) {
  return fields.filter((f) => f.type === "text").map((f) => f.name);
}
