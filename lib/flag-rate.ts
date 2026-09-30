/**
 * How often a clinician flags rather than judges.
 *
 * This is the only number that says whether flagging is being used as the
 * escape hatch it is. Flagging is meant to happen — a panel that never flags is
 * a panel guessing at cases it should have declined — but it is also the
 * cheapest pass to make, so an operator needs to be able to see a clinician who
 * flags everything. Nothing else on the console shows it.
 *
 * Pure, and kept apart from the route, because the two edge cases below are the
 * whole point of it and are worth testing without a database.
 */

/**
 * Flags as a share of the cases they acted on, or null when they acted on none.
 *
 * Null rather than 0: a clinician who has done nothing has not flagged nothing,
 * they have not been asked anything, and 0% beside a new name reads as a record
 * they have not earned.
 */
export function flagRate(reviews: number, flags: number): number | null {
  const acted = reviews + flags;
  return acted === 0 ? null : flags / acted;
}

/**
 * The rate as an operator reads it.
 *
 * Rounding is held back from both ends. One flag in four hundred rounds to 0%,
 * which says they never flag when they did; three hundred and ninety-nine in
 * four hundred rounds to 100%, which says they never judge when they did. Both
 * are the wrong thing to tell someone deciding whether a clinician is using the
 * escape hatch honestly, so the extremes are reserved for the real extremes.
 */
export function formatFlagRate(rate: number | null): string {
  if (rate === null) return "—";
  if (rate > 0 && rate < 0.005) return "<1%";
  if (rate < 1 && rate > 0.995) return ">99%";
  return `${Math.round(rate * 100)}%`;
}
