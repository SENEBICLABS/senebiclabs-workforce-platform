/** The local environment for the hand-run scripts in this folder, read from .env.local. */

import fs from "fs";

export function loadEnv(file = ".env.local") {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
}

/**
 * Is this Supabase URL a throwaway on this machine?
 *
 * Fail closed: anything unparseable, empty or unrecognised counts as remote. A script
 * that writes gets to be wrong only in the direction of refusing to run.
 *
 * @param {unknown} url
 * @returns {boolean}
 */
export function isLocalSupabase(url) {
  if (typeof url !== "string" || url.trim() === "") return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  );
}

/**
 * Whether a script that writes may run against this database.
 *
 * The question is the Supabase URL, never the app's own URL: a Next server on localhost
 * reads the same .env.local, so a local APP_URL in front of a hosted project writes to
 * that project. Judging by the app's address is how a check meant for a test stack ends
 * up changing production.
 *
 * Remote is allowed only by an explicit ALLOW_REMOTE=1, which is an operator's decision
 * taken in the moment rather than a value that can sit forgotten in a file.
 *
 * Both are optional because both are read from places that may hold nothing: an unset
 * variable must land on the refusing side rather than on a type error.
 *
 * @param {{ supabaseUrl?: string, allowRemote?: string }} options
 * @returns {{ ok: boolean, remote: boolean, reason?: string }}
 */
export function remoteGuard({ supabaseUrl, allowRemote }) {
  if (isLocalSupabase(supabaseUrl)) return { ok: true, remote: false };
  if (allowRemote === "1") return { ok: true, remote: true };
  return {
    ok: false,
    remote: true,
    reason:
      "NEXT_PUBLIC_SUPABASE_URL in .env.local is not a local database. This script holds " +
      "cases while it checks them, so running it here would take real work out of " +
      "circulation. Point it at a throwaway stack, or set ALLOW_REMOTE=1 if you mean it.",
  };
}
