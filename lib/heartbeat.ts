/**
 * Keeping a case held while a clinician reads it.
 *
 * A case is leased for an hour when it is served, and the lease may be renewed four times
 * (HEALTH's migration 009), so the longest a single case can be held is eight hours. This
 * is the loop that does the renewing.
 *
 * Nothing here touches React, the network or a clock directly: the beat, the clock and the
 * scheduler are all passed in. That is deliberate, and for the same reason as
 * ./availability-rules — the awkward cases are the whole point, and they are the ones that
 * are impossible to arrange through a component. A lease lapsing mid-review, a reply
 * arriving after the clinician has moved on, two beats overlapping, a laptop asleep for an
 * hour: each of those is a test below rather than something to find out in production.
 *
 * WHAT THIS IS NOT. A renewed lease is not a saved review. It says the case is still this
 * clinician's to answer, and nothing about whether they have answered it. The submit path
 * is the only thing that records work, and its reply is the only thing that may tell a
 * clinician their review was saved.
 */

/** What a beat found out. `unknown` is a beat that did not get an answer. */
export type BeatResult =
  | { held: true }
  | { held: false; reason: string }
  | { unknown: true };

export interface HeartbeatHandle {
  /** Stops the loop. Safe to call more than once, and from a cleanup. */
  stop(): void;
}

export interface HeartbeatOptions {
  /** Asks the server to renew. Should not throw; a rejection is treated as `unknown`. */
  beat: () => Promise<BeatResult>;
  /**
   * The lease has ended and the case is no longer theirs. Called at most once per loop.
   *
   * This has to reach the clinician somewhere they will see it before they spend more
   * time on the case. It must not be a transient toast and it must not be swallowed.
   */
  onLost: (reason: string) => void;
  /**
   * Whether the clinician is still working. A beat is skipped when this is false, so a
   * tab left open overnight stops renewing and the case goes back to the pool by itself.
   * Default: always working.
   */
  isActive?: () => boolean;
  /**
   * How long between beats. The default sits just inside the hour-long lease, so a beat
   * is late rather than wasteful: beating every few minutes would spend the four
   * renewals in twenty and end the lease sooner than doing nothing.
   */
  intervalMs?: number;
  /** Consecutive unanswered beats before the loop gives up. */
  maxFailures?: number;
  /** Backoff for an unanswered beat. Short, because a skipped beat is near the expiry. */
  backoffMs?: (failures: number) => number;
  /**
   * How soon to look again after skipping a beat because nobody was working.
   *
   * Much shorter than the interval, and that matters: a clinician who glanced at another
   * tab at the moment a beat was due would otherwise not be looked at again until long
   * after the lease had lapsed, and would lose a case they were in the middle of. Looking
   * again in a couple of minutes keeps the case for them, while a tab that stays hidden
   * is never beaten for at all and the lease still runs out as it should.
   */
  inactiveRecheckMs?: number;
  /** Injected for tests. */
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export const LEASE_MS = 60 * 60 * 1000;
export const DEFAULT_INTERVAL_MS = 50 * 60 * 1000;
export const DEFAULT_MAX_FAILURES = 4;
export const DEFAULT_INACTIVE_RECHECK_MS = 2 * 60 * 1000;

/** The shortest and longest interval worth configuring. */
export const MIN_INTERVAL_MS = 1_000;
export const MAX_INTERVAL_MS = LEASE_MS - 60_000;

/**
 * The configured interval, or undefined to use the default.
 *
 * Validated rather than trusted: an unparseable, zero, negative or absurd value would
 * either beat continuously or never beat at all, and both lose the clinician their case.
 * Anything outside the range falls back to the default, which is always safe.
 *
 * The ceiling is one minute inside the lease, because an interval at or past the lease
 * length would let the hold expire before the first beat is even attempted.
 */
export function heartbeatIntervalMs(
  raw: string | undefined = process.env.NEXT_PUBLIC_HEARTBEAT_INTERVAL_MS
): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || !Number.isInteger(ms)) return undefined;
  if (ms < MIN_INTERVAL_MS || ms > MAX_INTERVAL_MS) return undefined;
  return ms;
}

const defaultBackoff = (failures: number) =>
  Math.min(30_000 * 2 ** (failures - 1), 4 * 60 * 1000);

/**
 * Starts renewing, and returns the handle that stops it.
 *
 * The loop is a chain of single timers rather than an interval, so a slow beat can never
 * overlap the next one: the next is only scheduled once the last has settled.
 */
export function startHeartbeat(options: HeartbeatOptions): HeartbeatHandle {
  const {
    beat,
    onLost,
    isActive = () => true,
    intervalMs = DEFAULT_INTERVAL_MS,
    maxFailures = DEFAULT_MAX_FAILURES,
    inactiveRecheckMs = DEFAULT_INACTIVE_RECHECK_MS,
    backoffMs = defaultBackoff,
    schedule = (fn, ms) => setTimeout(fn, ms),
    cancel = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options;

  let stopped = false;
  let timer: unknown = null;
  let inFlight = false;
  let failures = 0;
  let lostCalled = false;

  const stop = () => {
    stopped = true;
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  };

  // The lease has ended. Said once, and the loop is over: there is nothing left to renew,
  // and beating on would turn one piece of bad news into a stream of it.
  const lost = (reason: string) => {
    if (lostCalled) return;
    lostCalled = true;
    stop();
    onLost(reason);
  };

  const later = (ms: number) => {
    if (stopped) return;
    timer = schedule(() => {
      timer = null;
      void tick();
    }, ms);
  };

  const tick = async () => {
    // A timer that fires after stop(), or while a beat is still out, is dropped. Both
    // happen in ordinary use: a clinician submits while a beat is in the air.
    if (stopped || inFlight) return;

    // Not working: the case stays theirs until the lease runs out on its own. Skipping is
    // what makes an abandoned tab give the case back rather than hold it for hours.
    if (!isActive()) {
      later(inactiveRecheckMs);
      return;
    }

    inFlight = true;
    let result: BeatResult;
    try {
      result = await beat();
    } catch {
      result = { unknown: true };
    } finally {
      inFlight = false;
    }

    // Settled after the clinician moved on: their next case must not be affected by the
    // reply about their last one.
    if (stopped) return;

    if ("unknown" in result) {
      failures += 1;
      if (failures >= maxFailures) {
        // Never claim the case was lost on our own say-so: we do not know. The clinician
        // is told the hold is unconfirmed, which is the true thing, and submitting is
        // still the only way to find out.
        lost("We could not confirm your hold on this case. Submit soon, or reload.");
        return;
      }
      later(backoffMs(failures));
      return;
    }

    failures = 0;
    if (result.held) {
      later(intervalMs);
    } else {
      lost(result.reason);
    }
  };

  later(intervalMs);
  return { stop };
}
