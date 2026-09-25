import { describe, expect, it } from "vitest";
import {
  answersToLsResult,
  findingOptionsFor,
  normalizeConfig,
  TranslationError,
  type RawEvalConfig,
} from "../lib/eval-config";

/**
 * The follow-up under a structured field.
 *
 * It used to be a dropdown over the pool's classes, always. That is right only
 * where the classes answer the follow-up's question. In the lab-interpretation
 * pool the classes are answer categories — Normal, Borderline, Abnormal,
 * Critical — and the follow-up asks which red flag the output ignored, so every
 * option offered was wrong and the clinician had no way to answer. Worse, the
 * validator refused anything outside that same list, so even a correct typed
 * answer would have been rejected on submit.
 *
 * The field decides now: an explicit list, or the pool's classes where a field
 * opts in, or a text box. These are the tests for that rule, and they run
 * against the real config translation rather than a fake, because the bug lived
 * in exactly the gap between what the form offered and what the validator
 * would accept.
 */

/** A pool whose classes answer a different question from the follow-up. */
const labPool = (extra: Record<string, unknown> = {}): RawEvalConfig => ({
  title: "Lab interpretation",
  purpose: "evaluate",
  schema: {
    classes: ["Normal", "Borderline", "Abnormal — non-urgent", "Critical"],
    field_order: ["red_flag_missed"],
    fields: {
      red_flag_missed: {
        type: "structured",
        label: "Did the presentation contain a red flag the output ignored?",
        finding_label: "Name the red flag",
        ...extra,
      },
    },
  },
});

const fieldOf = (raw: RawEvalConfig) => normalizeConfig(raw).fields[0];
const classesOf = (raw: RawEvalConfig) => normalizeConfig(raw).classes;

const translate = (raw: RawEvalConfig, answers: Record<string, unknown>) =>
  answersToLsResult(normalizeConfig(raw), answers);

const findingIn = (result: ReturnType<typeof translate>, name: string) =>
  result.find((entry) => entry.from_name === `${name}_finding`);

describe("what the follow-up offers", () => {
  it("offers nothing to pick when the field names no findings", () => {
    const raw = labPool();
    expect(findingOptionsFor(fieldOf(raw), classesOf(raw))).toBeNull();
  });

  it("does not fall back to the pool's classes", () => {
    // The whole bug: these classes are answer categories, not red flags. The
    // classes exist and are non-empty, and are still not offered.
    const raw = labPool();
    expect(classesOf(raw)).toContain("Normal");
    expect(findingOptionsFor(fieldOf(raw), classesOf(raw)) ?? []).not.toContain("Normal");
  });

  it("offers the pool's classes when the field asks for them", () => {
    const raw = labPool({ finding_from_classes: true });
    expect(findingOptionsFor(fieldOf(raw), classesOf(raw))).toEqual([
      "Normal",
      "Borderline",
      "Abnormal — non-urgent",
      "Critical",
    ]);
  });

  it("offers its own list, in preference to the pool's classes", () => {
    const raw = labPool({
      finding_options: ["Meningism", "Chest pain with diaphoresis"],
      finding_from_classes: true,
    });
    expect(findingOptionsFor(fieldOf(raw), classesOf(raw))).toEqual([
      "Meningism",
      "Chest pain with diaphoresis",
    ]);
  });

  it("falls back to a text box when it asks for classes and there are none", () => {
    const raw: RawEvalConfig = {
      schema: {
        fields: { f: { type: "structured", finding_from_classes: true } },
      },
    };
    expect(findingOptionsFor(fieldOf(raw), classesOf(raw))).toBeNull();
  });

  it("carries the follow-up's own question", () => {
    expect(fieldOf(labPool()).finding_label).toBe("Name the red flag");
  });
});

describe("submitting a typed finding", () => {
  it("accepts one, where the field names no findings", () => {
    const result = translate(labPool(), {
      red_flag_missed: "Yes",
      red_flag_missed_finding: "New neck stiffness with a 2-day headache",
    });
    expect(findingIn(result, "red_flag_missed")?.value).toEqual({
      choices: ["New neck stiffness with a 2-day headache"],
    });
  });

  it("records the Yes alongside it", () => {
    const result = translate(labPool(), {
      red_flag_missed: "Yes",
      red_flag_missed_finding: "Meningism",
    });
    expect(result.find((e) => e.from_name === "red_flag_missed")?.value).toEqual({
      choices: ["Yes"],
    });
  });

  it("would have been refused before this rule existed", () => {
    // Proof the fix is load-bearing: under the old behaviour the allow-list was
    // the pool's classes, so this same answer threw.
    const raw = labPool();
    const allowed = classesOf(raw);
    expect(allowed.includes("Meningism")).toBe(false);
    expect(() =>
      translate(raw, { red_flag_missed: "Yes", red_flag_missed_finding: "Meningism" })
    ).not.toThrow();
  });
});

describe("a field that does offer a list", () => {
  it("still refuses a finding outside the pool's classes", () => {
    expect(() =>
      translate(labPool({ finding_from_classes: true }), {
        red_flag_missed: "Yes",
        red_flag_missed_finding: "Something nobody listed",
      })
    ).toThrow(TranslationError);
  });

  it("still accepts one from the list", () => {
    const result = translate(labPool({ finding_from_classes: true }), {
      red_flag_missed: "Yes",
      red_flag_missed_finding: "Critical",
    });
    expect(findingIn(result, "red_flag_missed")?.value).toEqual({ choices: ["Critical"] });
  });

  it("refuses a finding outside an explicit finding_options list", () => {
    expect(() =>
      translate(labPool({ finding_options: ["Meningism", "Sepsis"] }), {
        red_flag_missed: "Yes",
        red_flag_missed_finding: "Critical",
      })
    ).toThrow(TranslationError);
  });
});

describe("Yes still needs an answer", () => {
  it("refuses Yes with an empty finding, with no list", () => {
    expect(() =>
      translate(labPool(), { red_flag_missed: "Yes", red_flag_missed_finding: "" })
    ).toThrow(/needs a finding/);
  });

  it("refuses Yes with no finding sent at all", () => {
    expect(() => translate(labPool(), { red_flag_missed: "Yes" })).toThrow(
      /needs a finding/
    );
  });

  it("refuses Yes with an empty finding where a list exists", () => {
    expect(() =>
      translate(labPool({ finding_from_classes: true }), {
        red_flag_missed: "Yes",
        red_flag_missed_finding: "",
      })
    ).toThrow(/needs a finding/);
  });

  it("accepts No on its own, and records an empty finding", () => {
    const result = translate(labPool(), { red_flag_missed: "No" });
    expect(result.find((e) => e.from_name === "red_flag_missed")?.value).toEqual({
      choices: ["No"],
    });
    expect(findingIn(result, "red_flag_missed")?.value).toEqual({ choices: [] });
  });

  it("treats an untouched optional field as No, not as Yes", () => {
    const result = translate(labPool(), {});
    expect(result.find((e) => e.from_name === "red_flag_missed")?.value).toEqual({
      choices: ["No"],
    });
  });
});
