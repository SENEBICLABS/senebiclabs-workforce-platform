import "server-only";

/**
 * HEALTH, which owns what happens to a case after clinicians have read it.
 *
 * The platform serves cases and records who did what. HEALTH decides whether a
 * case is settled, and holds the ones where the readings disagree. That split
 * is deliberate: there is one authority on adjudication state and it is not
 * this service, so held cases are asked for rather than inferred. The platform
 * could work them out from its own answers — lib/consensus.ts already tells a
 * split from a majority — but HEALTH's view also reflects gold checks and QA
 * rules this service does not model, and two systems disagreeing about which
 * cases are unresolved is worse than one HTTP call.
 *
 * Two calls, in opposite directions and with opposite failure rules:
 *
 *   heldCases    read, on the serving path. Fails soft: if HEALTH is slow or
 *                unreachable a senior is offered ordinary work instead of an
 *                error, because not being shown a held case is a small loss and
 *                a hung queue is a large one.
 *
 *   adjudicate   write, and the clinician's work is in it. Fails loudly, so the
 *                route can tell them it did not save rather than discard a
 *                judgement they will think they made.
 */

/**
 * Where HEALTH's project API lives, including the version and the /project
 * segment: the endpoints hang directly off it as /admin/held/{id} and
 * /admin/adjudicate. Keeping the whole prefix in one variable means a version
 * bump on their side is an environment change rather than a deploy on ours.
 */
const BASE = process.env.HEALTH_API_BASE?.replace(/\/+$/, "");
const KEY = process.env.HEALTH_ADMIN_KEY;
/** Which header carries the key. Configurable so HEALTH can change it without a deploy. */
const KEY_HEADER = process.env.HEALTH_KEY_HEADER || "X-Admin-Key";

/** Short, because a senior asking for work should not wait on another service. */
const HELD_TIMEOUT_MS = 4_000;
/** Longer: losing this call loses a clinician's judgement. */
const WRITE_TIMEOUT_MS = 10_000;
/**
 * How long a held list is reused.
 *
 * Cases join the held list when a second reading disagrees and leave it when a
 * senior settles them. Neither happens often, and a list a few seconds stale is
 * safe in both directions: a case that has just been settled is refused by the
 * one-adjudication index before anything is written, and a case that has just
 * become held is offered a few seconds later than it might have been.
 */
const HELD_TTL_MS = 20_000;

export interface EarlierAnswer {
  /** Whatever the clinician answered. Never carries who they were. */
  answers?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HeldCase {
  ls_task_id: number;
  /** HEALTH's own index for the item, which /adjudicate is addressed by. */
  idx: number;
  project_id: number;
  case_id: string;
  agreement: number | null;
  content: unknown;
  earlier_answers: EarlierAnswer[];
}

export class HealthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HealthError";
  }
}

export function healthConfigured(): boolean {
  return Boolean(BASE && KEY);
}

async function call<T>(
  path: string,
  init: RequestInit,
  timeoutMs: number
): Promise<T> {
  if (!BASE || !KEY) {
    throw new HealthError("HEALTH is not configured", 500);
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        [KEY_HEADER]: KEY,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new HealthError(`HEALTH ${path} did not answer within ${timeoutMs}ms`, 504);
    }
    throw err;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new HealthError(
      `HEALTH ${init.method ?? "GET"} ${path} → ${res.status} ${detail.slice(0, 300)}`,
      res.status
    );
  }

  return (res.status === 204 ? undefined : await res.json()) as T;
}

const heldCache = new Map<number, { cases: HeldCase[]; at: number }>();

/**
 * The cases HEALTH is holding for a project, or an empty list if it cannot say.
 *
 * Never throws. A senior whose queue cannot reach HEALTH gets ordinary work,
 * and the reason is logged rather than shown: "there is nothing held for you"
 * and "we could not ask" look the same to them, and only one of them is worth
 * interrupting their work for.
 */
export async function heldCases(projectId: number): Promise<HeldCase[]> {
  if (!healthConfigured()) return [];

  const remembered = heldCache.get(projectId);
  if (remembered && Date.now() - remembered.at < HELD_TTL_MS) {
    return remembered.cases;
  }

  try {
    const body = await call<{ held?: HeldCase[] }>(
      `/admin/held/${projectId}`,
      { method: "GET" },
      HELD_TIMEOUT_MS
    );
    const cases = Array.isArray(body?.held) ? body.held : [];
    heldCache.set(projectId, { cases, at: Date.now() });
    return cases;
  } catch (err) {
    console.error(`[health] could not read held cases for project ${projectId}`, err);
    return [];
  }
}

/** Drops the cached list, so a case just settled stops being offered at once. */
export function forgetHeld(projectId: number): void {
  heldCache.delete(projectId);
}

/**
 * Records a senior's decision as the case's final answer.
 *
 * Throws on failure. The caller has already claimed the pass in the database,
 * and must undo that if this does not land, or the senior would be recorded for
 * work whose decision never reached anyone.
 */
export async function adjudicate(decision: {
  project_id: number;
  idx: number;
  final_label: Record<string, unknown>;
  note: string;
  decided_by: { clinician_id: string; email: string; credentials?: string };
}): Promise<void> {
  await call<unknown>(
    "/admin/adjudicate",
    { method: "POST", body: JSON.stringify(decision) },
    WRITE_TIMEOUT_MS
  );
}
