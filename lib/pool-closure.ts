import "server-only";
import { supabaseAdmin } from "./supabase";

/**
 * Which pools an operator has closed.
 *
 * Asked separately rather than joined into the queries that need it, for one
 * reason: the column arrives with a migration, and between a deploy and that
 * migration being run a join naming `closed_at` fails outright. Selecting it
 * here means a missing column costs the closed list and nothing else — every
 * pool reads as open, which is what they all were a moment earlier, and the
 * pool list and the gate keep working.
 *
 * Cached for a few seconds because closing a pool is a rare, deliberate act and
 * this is read on every gated request. Dropped on write, so an operator who
 * closes a pool sees it take effect rather than waiting out a timer.
 */

const TTL_MS = 15_000;
let cache: { closed: Map<string, string>; at: number } | null = null;

/** Postgres: column does not exist. The migration has not been run yet. */
const UNDEFINED_COLUMN = "42703";

async function load(): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin
    .from("pools")
    .select("id, closed_at")
    .not("closed_at", "is", null);

  if (error) {
    if (error.code !== UNDEFINED_COLUMN) {
      console.error("[pools] could not read closures", error);
    }
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [String(row.id), String(row.closed_at)])
  );
}

export async function closedPools(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.closed;
  const closed = await load();
  cache = { closed, at: Date.now() };
  return closed;
}

/** When this pool was closed, or null while it is open. */
export async function closedAtFor(poolId: string): Promise<string | null> {
  return (await closedPools()).get(poolId) ?? null;
}

/** Drops the cache, so a pool just closed stops being served at once. */
export function forgetClosures(): void {
  cache = null;
}
