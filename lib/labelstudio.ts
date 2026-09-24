import "server-only";

/**
 * Label Studio client. Server-only, by construction.
 *
 * The `server-only` import above makes the build fail if any of this is ever
 * pulled into a client component. Clinicians authenticate to this platform and
 * never receive an LS URL or token — every read and write goes server-to-server
 * through the functions here.
 */

const LS_URL = process.env.LABEL_STUDIO_API_URL;
const LS_TOKEN = process.env.LABEL_STUDIO_API_TOKEN;

export interface LsTask {
  id: number;
  data: Record<string, unknown>;
  is_labeled: boolean;
  total_annotations: number;
  annotations?: { id: number }[];
}

export interface LsResult {
  from_name: string;
  to_name: string;
  type: string;
  value: Record<string, unknown>;
}

class LabelStudioError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "LabelStudioError";
  }
}

/**
 * How long we will wait for Label Studio before giving up.
 *
 * There was no limit at all, which is a way of saying "wait for ever". Label
 * Studio is a separate service on another continent, and when it is slow every
 * request that touches it was slow with it, up to whatever the platform's own
 * ceiling happened to be. The dashboard was the worst of it: the pool list
 * needs Label Studio only for a case count, which is decoration, and a hung
 * count should never hold the list hostage.
 *
 * Two budgets, because the two kinds of call are worth different amounts of
 * patience. Anything that would lose a clinician's work if it failed gets the
 * longer one. A count does not, so it gets the short one and reports "unknown"
 * instead of making someone wait.
 */
const LS_TIMEOUT_MS = 10_000;
const LS_COUNT_TIMEOUT_MS = 4_000;

async function ls<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = LS_TIMEOUT_MS
): Promise<T> {
  if (!LS_URL || !LS_TOKEN) {
    throw new LabelStudioError("Label Studio is not configured", 500);
  }

  let res: Response;
  try {
    res = await fetch(`${LS_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Token ${LS_TOKEN}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      // A caller that brought its own signal keeps it.
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      // 504 so callers that branch on status treat it as "upstream did not
      // answer" rather than as a refusal or a missing task.
      throw new LabelStudioError(
        `LS ${init.method ?? "GET"} ${path} did not answer within ${timeoutMs}ms`,
        504
      );
    }
    throw err;
  }

  if (!res.ok) {
    // Body may carry detail useful in our logs — never forwarded to the client.
    const detail = await res.text().catch(() => "");
    throw new LabelStudioError(
      `LS ${init.method ?? "GET"} ${path} → ${res.status} ${detail.slice(0, 300)}`,
      res.status
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface LsProject {
  id: number;
  task_number: number;
  num_tasks_with_annotations: number;
}

/** Project-level counts. Far cheaper than listing tasks just to size a pool. */
export async function getProject(projectId: number): Promise<LsProject> {
  return ls<LsProject>(`/api/projects/${projectId}/`);
}

const PAGE_SIZE = 200;
/**
 * Smaller than PAGE_SIZE, because seeking one task should not pay for a large
 * page. Each LS page carries every task's annotations, so cost scales with the
 * page: 200 tasks costs ~670ms against ~390ms for 50. Fifty candidates is
 * ample to find an available task in a pool being worked front-to-back.
 */
const SEEK_PAGE_SIZE = 50;
/** Guards against an unbounded loop if a project is enormous or LS misbehaves. */
const MAX_PAGES = 100;

/**
 * How many tasks a project holds, remembered for a short while.
 *
 * `/api/tasks/?project=N` reports `total` alongside the page, so one request
 * with the smallest possible page answers this — no need to walk the project.
 *
 * The caching is what makes the dashboard quick. Label Studio is in the United
 * States and this app runs in Dublin, so each of these costs roughly 300ms of
 * pure distance, and the pool list makes one per pool: the wait grew every time
 * a pool was added, which is exactly when it started to feel slow.
 *
 * A count only changes when someone imports tasks into a project, which happens
 * rarely and never from inside this app, so a number up to a minute old is
 * accurate in every way a clinician would notice. What they watch move is how
 * many they have reviewed, and that is counted in the database on every
 * request, never from here.
 *
 * A failed lookup is deliberately not cached: it returns null so the caller can
 * say "unknown" rather than invent a figure, and the next request tries again
 * rather than repeating the failure for a minute.
 */
const COUNT_TTL_MS = 60_000;
const countCache = new Map<number, { total: number; at: number }>();

export async function countTasks(projectId: number): Promise<number | null> {
  const remembered = countCache.get(projectId);
  if (remembered && Date.now() - remembered.at < COUNT_TTL_MS) {
    return remembered.total;
  }

  const res = await ls<{ total?: number }>(
    `/api/tasks/?project=${projectId}&page=1&page_size=1`,
    {},
    LS_COUNT_TIMEOUT_MS
  );
  const total = typeof res?.total === "number" ? res.total : null;
  if (total !== null) countCache.set(projectId, { total, at: Date.now() });
  return total;
}

/**
 * The first task in a project this clinician may work on.
 *
 * Walks pages and returns as soon as a page yields a candidate, rather than
 * collecting the whole project and filtering afterwards. Serving one task from
 * a 1,300-task project costs one page, not seven — and the cost no longer grows
 * with the size of the client's pool.
 */
export async function findNextTask(
  projectId: number,
  excludeTaskIds: Set<number>,
  maxAnnotations: number | null
): Promise<LsTask | null> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await ls<{ tasks?: LsTask[] } | LsTask[]>(
      `/api/tasks/?project=${projectId}&page=${page}&page_size=${SEEK_PAGE_SIZE}&ordering=id`
    );
    const rows = Array.isArray(body) ? body : (body?.tasks ?? []);
    if (rows.length === 0) return null;

    const candidate = selectNextTask(rows, excludeTaskIds, maxAnnotations);
    if (candidate) return candidate;

    // This page was entirely taken; only then is the next page worth fetching.
    if (rows.length < SEEK_PAGE_SIZE) return null;
  }

  console.error(
    `[labelstudio] project ${projectId} exceeded ${MAX_PAGES} pages while seeking a task`
  );
  return null;
}

/**
 * Every task in a project.
 *
 * Label Studio ignores `limit` and pages this endpoint at 50 by default, so a
 * single call silently truncates: a pool of 500 cases would serve 50 and then
 * report itself drained. Pages are followed explicitly until one comes back
 * short.
 */
export async function listTasks(projectId: number): Promise<LsTask[]> {
  const all: LsTask[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await ls<LsTask[] | { tasks?: LsTask[] }>(
      `/api/projects/${projectId}/tasks/?page=${page}&page_size=${PAGE_SIZE}`
    );

    // A page past the end comes back as an object, not an array.
    const rows = Array.isArray(batch) ? batch : (batch?.tasks ?? []);
    all.push(...rows);

    if (rows.length < PAGE_SIZE) return all;
  }

  console.error(
    `[labelstudio] project ${projectId} exceeded ${MAX_PAGES} pages; list truncated`
  );
  return all;
}

export async function getTask(taskId: number): Promise<LsTask> {
  return ls<LsTask>(`/api/tasks/${taskId}/`);
}

/**
 * Writes an annotation against the task-based endpoint.
 * Returns the new annotation id so a failed follow-up write can roll it back.
 */
export async function createAnnotation(
  taskId: number,
  result: LsResult[]
): Promise<number> {
  const created = await ls<{ id: number }>(
    `/api/tasks/${taskId}/annotations/`,
    {
      method: "POST",
      body: JSON.stringify({
        result,
        was_cancelled: false,
      }),
    }
  );
  return created.id;
}

/** Compensating rollback: used only when the completion record fails to save. */
export async function deleteAnnotation(annotationId: number): Promise<void> {
  await ls<void>(`/api/annotations/${annotationId}/`, { method: "DELETE" });
}

/**
 * The next task in a project this clinician may work on.
 *
 * Excludes anything they already completed or flagged, anything LS considers
 * finished, and anything that has reached the pool's annotation ceiling.
 */
export function selectNextTask(
  tasks: LsTask[],
  excludeTaskIds: Set<number>,
  maxAnnotations: number | null
): LsTask | null {
  const available = tasks.filter((task) => {
    if (excludeTaskIds.has(task.id)) return false;
    if (task.is_labeled) return false;
    if (maxAnnotations !== null && task.total_annotations >= maxAnnotations) {
      return false;
    }
    return true;
  });

  // Lowest id first, so a pool is worked front-to-back and overlap fills evenly.
  available.sort((a, b) => a.id - b.id);
  return available[0] ?? null;
}

export { LabelStudioError };
