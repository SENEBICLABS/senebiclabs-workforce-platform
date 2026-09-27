import type { NormalizedConfig, RawEvalConfig } from "./eval-config";

/**
 * What to record when a senior settles a contested case.
 *
 * The senior never sees the earlier readings. They judge the case as their own
 * work, and this compares afterwards, so the comparison is bookkeeping rather
 * than a nudge: an independent third judgement is worth something a refereed
 * one is not, and agreement figures only mean anything if the third reader was
 * not shown what to agree with.
 *
 * Two outcomes, and the note says which happened:
 *
 *   majority  the senior's answer matched one of the earlier readings, so two
 *             of three now agree and that is the case's answer
 *   senior    all three differed, and the senior's answer stands because they
 *             are the senior reviewer
 *
 * Compared on one field, not on the whole form. Free text never matches, and
 * scales rarely do, so comparing everything would report "all three differed"
 * on every case and the distinction would be worthless. The pool says which
 * field decides — `schema.primary_field` — and where it does not, the first
 * single-choice field stands in, because that is what such a form asks first.
 */

export type Outcome = "majority" | "senior" | "incomparable";

export interface Decision {
  outcome: Outcome;
  /** The field the comparison was made on, or null when none could be. */
  field: string | null;
  /** One line for HEALTH's record, saying what happened and why. */
  note: string;
}

/** An earlier reading as HEALTH sends it: a flat answer map, with no author. */
export type EarlierReading = Record<string, unknown>;

/**
 * The field whose value decides the case.
 *
 * `primary_field` is the pool's own answer and wins. Otherwise the first
 * single-choice field, which in every config written so far is the verdict.
 */
export function decidingField(
  config: NormalizedConfig,
  raw: RawEvalConfig | null
): string | null {
  const named = (raw?.schema as { primary_field?: unknown } | undefined)
    ?.primary_field;
  if (typeof named === "string" && named) {
    const exists = config.fields.some((f) => f.name === named);
    if (exists) return named;
  }
  return config.fields.find((f) => f.type === "single")?.name ?? null;
}

/** How a value reads in a note: quoted, or "no answer" when absent. */
function shown(value: unknown): string {
  if (value === null || value === undefined || value === "") return "no answer";
  return `"${String(value)}"`;
}

/**
 * Compares a senior's judgement against the earlier readings.
 *
 * Nothing here decides anything: the senior's answer is the final answer
 * either way. What changes is only what gets written down about how it came
 * about, which is what keeps the agreement figures honest later.
 */
export function summariseDecision(input: {
  config: NormalizedConfig;
  raw: RawEvalConfig | null;
  answers: Record<string, unknown>;
  earlier: EarlierReading[];
}): Decision {
  const { config, raw, answers, earlier } = input;
  const field = decidingField(config, raw);
  const title = config.fields.find((f) => f.name === field)?.title ?? field;

  if (!field || earlier.length === 0) {
    return {
      outcome: "incomparable",
      field,
      note:
        "Settled by the senior clinician. No earlier readings were available " +
        "to compare against, so no majority was computed.",
    };
  }

  const mine = answers[field];
  const theirs = earlier.map((reading) => reading[field]);
  // How many agree, not how many there are. With two earlier readings those
  // happen to be the same number, which is exactly the kind of coincidence
  // that reads as correct until a pool commissions three.
  const agreeing =
    theirs.filter((value) => value !== undefined && String(value) === String(mine))
      .length + 1;

  if (agreeing > 1) {
    return {
      outcome: "majority",
      field,
      note:
        `Settled by the senior clinician, judging the case independently. ` +
        `Their ${title} of ${shown(mine)} matched an earlier reading, so ` +
        `${agreeing} of ${earlier.length + 1} readings agree and that is the ` +
        `answer.`,
    };
  }

  return {
    outcome: "senior",
    field,
    note:
      `Settled by the senior clinician, judging the case independently. ` +
      `Their ${title} of ${shown(mine)} differed from every earlier reading ` +
      `(${theirs.map(shown).join(", ")}), so no majority formed and the ` +
      `senior's answer stands.`,
  };
}
