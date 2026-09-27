import { describe, expect, it } from "vitest";
import { decidingField, summariseDecision } from "../lib/adjudication";
import { normalizeConfig, type RawEvalConfig } from "../lib/eval-config";

/**
 * What gets written down when a senior settles a contested case.
 *
 * The senior judges it blind — they are never shown the earlier readings — so
 * this comparison happens afterwards and only affects the record. Both
 * outcomes have to be distinguishable, or the agreement figures stop meaning
 * anything: "two of three agreed" and "all three differed" are the two facts
 * worth keeping, and a comparison that collapsed them would quietly turn every
 * contested case into the same story.
 */

const pool = (extra: Record<string, unknown> = {}): RawEvalConfig => ({
  purpose: "evaluate",
  schema: {
    primary_field: "verdict",
    field_order: ["verdict", "severity", "rationale", "reasoning"],
    fields: {
      verdict: {
        type: "single",
        label: "Verdict",
        options: ["Correct", "Partial", "Incorrect"],
        required: true,
      },
      severity: { type: "single", label: "Severity", options: ["Minor", "Critical"] },
      rationale: { type: "text", label: "Why" },
      reasoning: { type: "scale", label: "Reasoning", max: 5 },
    },
    ...extra,
  },
});

const summarise = (
  answers: Record<string, unknown>,
  earlier: Record<string, unknown>[],
  raw: RawEvalConfig = pool()
) => summariseDecision({ config: normalizeConfig(raw), raw, answers, earlier });

/** Two earlier readings that disagree, as a held case always has. */
const EARLIER = [
  { verdict: "Partial", severity: "Minor", rationale: "Incomplete but safe.", reasoning: 3 },
  { verdict: "Correct", severity: "Minor", rationale: "Reasonable practice.", reasoning: 4 },
];

describe("which field decides", () => {
  it("uses the pool's primary_field", () => {
    const raw = pool();
    expect(decidingField(normalizeConfig(raw), raw)).toBe("verdict");
  });

  it("falls back to the first single-choice field when none is named", () => {
    const raw = pool({ primary_field: undefined });
    expect(decidingField(normalizeConfig(raw), raw)).toBe("verdict");
  });

  it("ignores a primary_field naming a field that does not exist", () => {
    const raw = pool({ primary_field: "nonsense" });
    expect(decidingField(normalizeConfig(raw), raw)).toBe("verdict");
  });

  it("gives up when there is nothing categorical to compare", () => {
    const raw: RawEvalConfig = {
      schema: { fields: { notes: { type: "text", label: "Notes" } } },
    };
    expect(decidingField(normalizeConfig(raw), raw)).toBeNull();
  });
});

describe("a senior who agrees with one of the earlier readings", () => {
  const decision = summarise(
    { verdict: "Partial", rationale: "Different words, same conclusion." },
    EARLIER
  );

  it("reports a majority", () => {
    expect(decision.outcome).toBe("majority");
  });

  it("says so in the note, with the answer that carried it", () => {
    expect(decision.note).toContain("matched an earlier reading");
    expect(decision.note).toContain('"Partial"');
    expect(decision.note).toContain("2 of 3 readings agree");
  });

  it("does not depend on the free text matching", () => {
    // The rationale is nothing like either earlier one, and it still counts.
    expect(decision.outcome).toBe("majority");
  });
});

describe("a senior who agrees with neither", () => {
  const decision = summarise(
    { verdict: "Incorrect", rationale: "Both earlier readings are too generous." },
    EARLIER
  );

  it("reports that the senior's answer stands", () => {
    expect(decision.outcome).toBe("senior");
  });

  it("names what everyone said, so the record is reconstructable", () => {
    expect(decision.note).toContain("differed from every earlier reading");
    expect(decision.note).toContain('"Incorrect"');
    expect(decision.note).toContain('"Partial"');
    expect(decision.note).toContain('"Correct"');
  });

  it("says no majority formed", () => {
    expect(decision.note).toContain("no majority formed");
  });
});

describe("the count in the note is of who agrees, not how many read it", () => {
  it("two of three, in the ordinary case", () => {
    expect(summarise({ verdict: "Partial" }, EARLIER).note).toContain("2 of 3 readings agree");
  });

  it("still two of four when three read it and only one agreed", () => {
    const three = [...EARLIER, { verdict: "Incorrect", rationale: "A third view." }];
    const decision = summarise({ verdict: "Partial" }, three);
    expect(decision.outcome).toBe("majority");
    expect(decision.note).toContain("2 of 4 readings agree");
  });

  it("three of four when two of them agreed", () => {
    const three = [...EARLIER, { verdict: "Partial", rationale: "Agrees with the first." }];
    expect(summarise({ verdict: "Partial" }, three).note).toContain("3 of 4 readings agree");
  });
});

describe("the comparison is only ever on the deciding field", () => {
  it("a matching verdict is a majority even when everything else differs", () => {
    const decision = summarise(
      { verdict: "Correct", severity: "Critical", reasoning: 1, rationale: "Quite different." },
      EARLIER
    );
    expect(decision.outcome).toBe("majority");
  });

  it("a differing verdict stands even when everything else matches", () => {
    const decision = summarise(
      { verdict: "Incorrect", severity: "Minor", reasoning: 3, rationale: "Incomplete but safe." },
      EARLIER
    );
    expect(decision.outcome).toBe("senior");
  });
});

describe("cases the comparison cannot make", () => {
  it("says so when there are no earlier readings", () => {
    const decision = summarise({ verdict: "Correct" }, []);
    expect(decision.outcome).toBe("incomparable");
    expect(decision.note).toContain("No earlier readings");
  });

  it("says so when the pool has no field to compare on", () => {
    const raw: RawEvalConfig = {
      schema: { fields: { notes: { type: "text", label: "Notes" } } },
    };
    const decision = summarise({ notes: "something" }, EARLIER, raw);
    expect(decision.outcome).toBe("incomparable");
  });

  it("treats an unanswered deciding field as no match rather than a match", () => {
    // Two readings both absent must not be read as agreeing with each other.
    const decision = summarise({ rationale: "no verdict given" }, [
      { rationale: "also none" },
      { rationale: "nor here" },
    ]);
    expect(decision.outcome).toBe("senior");
  });
});

describe("every note says it was judged independently", () => {
  for (const [label, answers] of [
    ["majority", { verdict: "Partial" }],
    ["senior", { verdict: "Incorrect" }],
  ] as const) {
    it(`for the ${label} outcome`, () => {
      expect(summarise(answers, EARLIER).note).toContain("judging the case independently");
    });
  }
});
