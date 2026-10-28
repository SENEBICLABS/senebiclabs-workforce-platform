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

/**
 * Long enough for a cold connection, short enough not to hang a queue.
 *
 * Measured against the live service: the first call from a fresh process takes
 * over four seconds — DNS, TLS and whatever the far side does to wake up — and
 * every call after it lands in under one. At four seconds the first request
 * from each new instance timed out, and because this fails soft that was
 * invisible: the senior was quietly given ordinary work and the held case sat
 * there. A held case not being offered is the failure this whole queue exists
 * to prevent, so it is worth waiting for.
 *
 * The cost is bounded and paid once: the answer is cached, so only the first
 * request on a cold instance can wait this long.
 */
const HELD_TIMEOUT_MS = 8_000;
/** A nudge to score answers; the work is safe in the database either way. */
const NUDGE_TIMEOUT_MS = 1_500;
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
  /** HEALTH's project id: a uuid. */
  project_id: string;
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

const heldCache = new Map<string, { cases: HeldCase[]; known: boolean; at: number }>();

/**
 * Which project's held cases to ask for: the pool's HEALTH project
 * (`ls_task_id` in the answer is the task number, under its old name). A
 * GatedPool satisfies this as it is.
 */
export interface HeldScope {
  projectId: string;
}

function heldKey(scope: HeldScope): string {
  return `project:${scope.projectId}`;
}

function heldPath(scope: HeldScope): string {
  return `/admin/held/project/${encodeURIComponent(scope.projectId)}`;
}

/**
 * The held list, and whether it is worth believing.
 *
 * "HEALTH is holding nothing" and "we could not ask HEALTH" are the same empty
 * array, and they mean opposite things to anything deciding whether a pool is
 * finished: the first says the work is done, the second says we do not know.
 * Serving can treat them alike, because a senior not being offered a held case
 * for a few seconds is a small loss. Declaring a pool closed cannot, because
 * that hides the work from everybody.
 */
export interface HeldSnapshot {
  cases: HeldCase[];
  /** False when the list is empty only because the read failed. */
  known: boolean;
}

/**
 * The cases HEALTH is holding for a project, or an empty list if it cannot say.
 *
 * Never throws. A senior whose queue cannot reach HEALTH gets ordinary work,
 * and the reason is logged rather than shown: "there is nothing held for you"
 * and "we could not ask" look the same to them, and only one of them is worth
 * interrupting their work for.
 */
export async function heldCases(scope: HeldScope): Promise<HeldCase[]> {
  return (await heldSnapshot(scope)).cases;
}

export async function heldSnapshot(scope: HeldScope): Promise<HeldSnapshot> {
  // Not configured is not the same as nothing held either. A deployment with no
  // HEALTH credentials cannot see disagreements at all, and must not conclude
  // from that silence that there are none.
  if (!healthConfigured()) return { cases: [], known: false };

  const key = heldKey(scope);
  const remembered = heldCache.get(key);
  if (remembered && Date.now() - remembered.at < HELD_TTL_MS) {
    return { cases: remembered.cases, known: remembered.known };
  }

  // One retry, and only for a connection that failed rather than one that ran
  // out of time. A refused or reset connection fails in milliseconds and is
  // usually gone by the next attempt, so retrying costs nothing and saves a
  // senior from being quietly handed ordinary work. A timeout is different: it
  // has already spent the whole budget, and trying again would double a wait
  // that was chosen to be bearable.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const body = await call<{ held?: HeldCase[] }>(
        heldPath(scope),
        { method: "GET" },
        HELD_TIMEOUT_MS
      );
      const cases = Array.isArray(body?.held) ? body.held : [];
      heldCache.set(key, { cases, known: true, at: Date.now() });
      return { cases, known: true };
    } catch (err) {
      const timedOut = err instanceof HealthError && err.status === 504;
      const cause = (err as { cause?: { code?: string } })?.cause?.code;
      const lastChance = attempt === 2 || timedOut;

      console.error(
        `[health] could not read held cases for ${key} ` +
          `(attempt ${attempt}${lastChance ? ", giving up" : ", retrying"})` +
          `${cause ? ` cause=${cause}` : ""}`,
        err
      );

      if (lastChance) return { cases: [], known: false };
    }
  }

  return { cases: [], known: false };
}

/** Drops the cached list, so a case just settled stops being offered at once. */
export function forgetHeld(scope: HeldScope): void {
  heldCache.delete(heldKey(scope));
}

/**
 * Records a senior's decision as the case's final answer.
 *
 * Throws on failure. The caller has already claimed the pass in the database,
 * and must undo that if this does not land, or the senior would be recorded for
 * work whose decision never reached anyone.
 */
export async function adjudicate(decision: {
  project_id: string;
  idx: number;
  final_label: Record<string, unknown>;
  note: string;
  /**
   * Who decided it, as a single string: HEALTH validates this as one, not as
   * an object. It is an internal audit line and never reaches a client, so it
   * carries the address and the id — the address to recognise, the id because
   * addresses change and it is the thing our own records join on.
   */
  decided_by: string;
}): Promise<void> {
  await call<unknown>(
    "/admin/adjudicate",
    { method: "POST", body: JSON.stringify(decision) },
    WRITE_TIMEOUT_MS
  );
}

/**
 * Tells HEALTH that answers are waiting to be scored on the task store.
 *
 * A nudge, not a delivery: the answer and its event are already committed in
 * the database, so if this call is lost nothing is lost with it. HEALTH also
 * drains the queue on every results poll and after any rebuild. It is sent and
 * not waited for, beyond the short budget below, because a clinician's next
 * case must not wait on HEALTH scoring the last one.
 */
export async function notifyAnswersRecorded(): Promise<void> {
  if (!healthConfigured()) return;
  try {
    await call<unknown>("/internal/process-answers", { method: "POST" }, NUDGE_TIMEOUT_MS);
  } catch {
    // Expected when HEALTH takes longer than the budget: the drain carries on there.
  }
}
