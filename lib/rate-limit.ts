import "server-only";

/**
 * A small fixed-window limiter, held in memory.
 *
 * Be clear about what this is and is not. Serverless runs many instances, and
 * each keeps its own map, so a determined attacker spreading requests across
 * instances gets a multiple of the limit. It is not a defence against a
 * distributed attack and should not be described as one.
 *
 * What it does buy: it stops one client hammering an endpoint in a loop, which
 * is the realistic shape of both magic-link email bombing and credential
 * spraying, and it costs nothing to run. If this ever needs to be real, the
 * replacement is a shared store keyed the same way, and only this file changes.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Keeps the map from growing without bound in a long-lived instance. */
function sweep(now: number) {
  if (windows.size < 5000) return;
  for (const [key, w] of windows) if (w.resetAt <= now) windows.delete(key);
}

export interface Limit {
  /** Requests permitted per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface LimitResult {
  ok: boolean;
  /** Seconds until the window resets, for Retry-After. */
  retryAfter: number;
}

export function rateLimit(key: string, { max, windowSeconds }: Limit): LimitResult {
  const now = Date.now();
  sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return { ok: existing.count <= max, retryAfter };
}

/**
 * Best-effort client address.
 *
 * Behind Vercel the leftmost x-forwarded-for entry is the client. This is
 * spoofable in general, which is why it is only ever one half of the key: the
 * email address is the half that matters for magic links.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
