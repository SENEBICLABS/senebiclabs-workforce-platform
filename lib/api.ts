/**
 * The browser's view of the platform.
 *
 * Everything the client knows comes through these calls. There is no Label
 * Studio URL, token, or result shape anywhere in this file — the server owns
 * all of that.
 */

export interface Me {
  /** Whether this clinician may invite colleagues. Gates the invite UI. */
  can_invite: boolean;
  id: string;
  name: string;
  email: string;
  agreement_accepted: boolean;
  eligible_pool_ids: string[];
}

export type Purpose = "evaluate" | "label" | "create";
export type PoolStatus = "not_started" | "in_progress" | "complete";

export interface Pool {
  id: string;
  name: string;
  purpose: Purpose;
  description: string | null;
  items: number | null;
  reviewed_by_me: number;
  status: PoolStatus;
}

export interface Field {
  name: string;
  type:
    | "single"
    | "from_classes"
    | "scale"
    | "text"
    | "flag"
    | "structured"
    | "spans";
  title: string;
  hint?: string;
  options?: string[];
  classes?: string[];
  max?: number;
  rows?: number;
  label?: string;
  required?: boolean;
  visible_when?: string;
  /** The follow-up under a structured field; see findingOptionsFor. */
  finding_label?: string;
  finding_options?: string[];
  finding_from_classes?: boolean;
}

export type ReviewAction = "approve" | "edit" | "reject";

export interface Task {
  /**
   * "author" and "review" are the two phases of written work.
   *
   * There is deliberately no phase for a contested case. A senior settling one
   * is served it exactly as any other case, and nothing in this payload says
   * otherwise — a third reader who knows a case was contested is no longer an
   * independent one.
   */
  phase?: "single" | "author" | "review";
  /** Present in the review phase: what the author wrote. */
  authored?: Record<string, unknown> | null;
  revision?: number;
  task_id: number;
  pool: { id: string; name: string; purpose: Purpose };
  case_id: string | null;
  context: { label: string; value: string }[];
  eval_config: {
    instructions: string | null;
    fields: Field[];
    classes: string[];
  };
  already_reviewed_count: number;
}

export interface Stats {
  reviewed_total: number;
  reviewed_this_week: number;
  /** Kept apart from the reviewed figures: a flag is paid work, but not a review. */
  flagged_total: number;
  flagged_this_week: number;
}

export interface CalibrationPool {
  id: string;
  name: string;
  purpose: Purpose;
  description: string | null;
  item_count: number;
  status: "not_attempted" | "passed";
  passed_at: string | null;
  attempts: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Signals a drained pool — a 204, which is not an error. */
export const NO_CONTENT = Symbol("no-content");

/**
 * Announced when a request comes back 401: the session is over, whether it was
 * signed out elsewhere, ended by an operator, or simply expired. The signed-in
 * layout listens for it and takes the person to sign-in, rather than leaving
 * every panel on the page to fail on its own.
 */
export const SIGNED_OUT_EVENT = "senebiclabs:signed-out";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "include",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError("We could not reach the server. Check your connection.", 0);
  }

  if (res.status === 204) return NO_CONTENT as T;

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* some errors carry no body */
  }

  if (res.status === 401 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  }

  if (!res.ok) {
    const message =
      (body as { error?: string })?.error ?? "Something went wrong.";
    throw new ApiError(message, res.status);
  }

  return body as T;
}

/** One pass over a case: the unit of work the platform records. */
export type PassKind =
  | "judgement"
  | "flag"
  | "authoring"
  | "review"
  | "adjudication";

export interface WorkRecord {
  total: number;
  by_kind: Record<PassKind, number>;
  by_pool: {
    pool_id: string;
    pool: string;
    total: number;
    kinds: Record<PassKind, number>;
  }[];
  recent: {
    id: string;
    kind: PassKind;
    pool: string;
    case_ref: number;
    at: string;
  }[];
  recent_limit: number;
}

export const api = {
  /** Emails a sign-in link. The same mechanism as an invite link, for someone
   *  who already has an account. */
  requestSignInLink: (email: string) =>
    call<{ success: true; expiresInMinutes: number }>("/api/auth/sign-in-link", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  /** Accepts an invitation and returns with the session cookie already set. */
  acceptInvite: (token: string) =>
    call<{ success: true; email: string; created: boolean }>(
      "/api/invites/accept",
      { method: "POST", body: JSON.stringify({ token }) }
    ),

  /** Exchanges a sign-in link token for the session cookie. */
  consumeSignInLink: (token: string, invite?: string | null) =>
    call<{ success: true; created: boolean }>("/api/auth/verify", {
      method: "POST",
      body: JSON.stringify({ token, invite: invite ?? null }),
    }),

  createInvite: (email: string) =>
    call<{ invited_email: string; expires_at: string; sent: boolean }>(
      "/api/invites",
      { method: "POST", body: JSON.stringify({ email }) }
    ),

  /** Approve, edit-and-approve, or send a written item back. */
  review: (
    taskId: number,
    action: ReviewAction,
    payload: { answers?: Record<string, unknown>; reason?: string } = {}
  ) =>
    call<{
      reviewed: true;
      action: "approved" | "edited" | "rejected";
      state: string;
    }>(`/api/tasks/${taskId}/review`, {
      method: "POST",
      body: JSON.stringify({ action, ...payload }),
    }),

  acceptAgreement: () =>
    call<{ success: true }>("/api/agreement/accept", {
      method: "POST",
      body: JSON.stringify({ accepted: true }),
    }),

  me: () => call<Me>("/api/me"),
  stats: () => call<Stats>("/api/me/stats"),
  passes: () => call<WorkRecord>("/api/me/passes"),
  pools: () => call<{ pools: Pool[] }>("/api/pools").then((r) => r.pools),

  nextTask: (poolId: string) =>
    call<Task | typeof NO_CONTENT>(`/api/pools/${poolId}/next`),

  submit: (taskId: number, answers: Record<string, unknown>) =>
    call<{ recorded: true; next: Task | null }>(`/api/tasks/${taskId}/submit`, {
      method: "POST",
      body: JSON.stringify({ answers }),
    }),

  flag: (taskId: number, reason: string) =>
    call<{ flagged: true }>(`/api/tasks/${taskId}/flag`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  calibrations: () =>
    call<{ pools: CalibrationPool[] }>("/api/calibration").then((r) => r.pools),

  signOut: () => call<{ ok: true }>("/api/auth/sign-out", { method: "POST" }),
};
