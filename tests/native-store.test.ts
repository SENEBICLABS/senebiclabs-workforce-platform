import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
// Only pure functions are under test; nothing here may touch a database.
vi.mock("../lib/supabase", () => ({ supabaseAdmin: {} }));

import {
  answersToLsResult,
  buildContext,
  isImageTask,
  normalizeConfig,
  optionsFor,
  TranslationError,
  type RawEvalConfig,
} from "../lib/eval-config";
import { ceilingFrom, clinicianConfig, POOL_SELECT, poolFacts } from "../lib/gate";
import { selectNextTask, type TaskState } from "../lib/availability-rules";
import { isTaskNumber, TASK_NO_FLOOR } from "../lib/taskstore";

/**
 * The parts of the native task store that are decisions rather than database
 * calls: how an answer is written, what a clinician is shown, and which config
 * and ceiling a pool runs on. The database side is tested against Postgres in
 * HEALTH's tests/sql.
 */

/** agent_trace_eval, as HEALTH's template defines it (the fields that matter here). */
const agentTrace: RawEvalConfig = {
  purpose: "evaluate",
  input: "text",
  schema: {
    input: "text",
    context: [{ key: "trace", label: "Agent trace" }],
    field_order: ["verdict", "step_errors", "first_failed_step", "rationale"],
    fields: {
      verdict: { type: "single", options: ["Correct", "Incorrect", "Partial"], required: true },
      step_errors: { type: "spans", options: ["Wrong tool or action", "Unsafe action"] },
      first_failed_step: { type: "number", min: 1, visible_when: "verdict!=Correct" },
      rationale: { type: "text", required: true },
    },
  },
};

describe("number answers are recorded, never dropped", () => {
  const config = normalizeConfig(agentTrace);

  it("writes first_failed_step as a number entry HEALTH's parser reads", () => {
    const result = answersToLsResult(config, {
      verdict: "Incorrect",
      first_failed_step: 3,
      rationale: "Step 3 called the wrong tool.",
    });
    expect(result).toContainEqual({
      from_name: "first_failed_step",
      to_name: "image",
      type: "number",
      value: { number: 3 },
    });
  });

  it("accepts the number as typed text too", () => {
    const result = answersToLsResult(config, {
      verdict: "Incorrect",
      first_failed_step: "4",
      rationale: "r",
    });
    expect(result.find((r) => r.from_name === "first_failed_step")?.value).toEqual({ number: 4 });
  });

  it.each([["3.5"], [2.5], ["three"], [0]])("refuses %p rather than guessing", (bad) => {
    expect(() =>
      answersToLsResult(config, { verdict: "Incorrect", first_failed_step: bad, rationale: "r" })
    ).toThrow(TranslationError);
  });

  it("leaves it out when the field is hidden, as for every other type", () => {
    const result = answersToLsResult(config, {
      verdict: "Correct",
      first_failed_step: 3,
      rationale: "r",
    });
    expect(result.map((r) => r.from_name)).not.toContain("first_failed_step");
  });

  it("refuses a field type it cannot record instead of skipping it", () => {
    const odd = normalizeConfig({
      schema: { fields: { mystery: { type: "slider" as never, required: false } } },
    });
    expect(() => answersToLsResult(odd, { mystery: 5 })).toThrow(/cannot record/);
  });
});

describe("highlights", () => {
  it("offers the field's own tags, not the pool's classes", () => {
    const withClasses = normalizeConfig({
      ...agentTrace,
      schema: { ...agentTrace.schema, classes: ["Normal", "Abnormal"] },
    });
    const field = withClasses.fields.find((f) => f.name === "step_errors")!;
    expect(optionsFor(field, withClasses.classes)).toEqual(["Wrong tool or action", "Unsafe action"]);
  });

  const config = normalizeConfig(agentTrace);
  const base = { verdict: "Incorrect", first_failed_step: 1, rationale: "r" };

  it("writes one labels entry per span, offsets and tag intact", () => {
    const result = answersToLsResult(config, {
      ...base,
      step_errors: [{ start: 10, end: 19, text: "calc tool", label: "Unsafe action" }],
    });
    expect(result).toContainEqual({
      from_name: "step_errors",
      to_name: "image",
      type: "labels",
      value: { start: 10, end: 19, text: "calc tool", labels: ["Unsafe action"] },
    });
  });

  it.each([
    [{ start: 5, end: 5, text: "", label: "Unsafe action" }],
    [{ start: -1, end: 4, text: "abcd", label: "Unsafe action" }],
    [{ start: "1", end: 4, text: "abc", label: "Unsafe action" }],
    [{ start: 1, end: 4, text: "abc", label: "Made up" }],
  ])("refuses a malformed or untagged span %#", (span) => {
    expect(() => answersToLsResult(config, { ...base, step_errors: [span] })).toThrow(
      TranslationError
    );
  });
});

describe("what a clinician is shown", () => {
  it("shows an image case as the image and the prediction, never the URL", () => {
    const raw: RawEvalConfig = { schema: { input: "image", fields: {} } };
    const data = { image: "https://x.supabase.co/storage/v1/object/sign/a?token=t", prediction: "Abnormal" };
    const blocks = buildContext(raw, data, 1_000_000_007);
    expect(blocks).toEqual([
      { label: "Image", value: "", kind: "image", src: "/api/tasks/1000000007/media" },
      { label: "Model prediction", value: "Abnormal" },
    ]);
    expect(JSON.stringify(blocks)).not.toContain("token=");
  });

  it("treats a config with no input as an image task only when the case has an image", () => {
    expect(isImageTask({ schema: {} }, { image: "https://a/b.png" })).toBe(true);
    expect(isImageTask({ schema: {} }, { prompt: "q" })).toBe(false);
    expect(isImageTask({ schema: { input: "text" } }, { image: "https://a/b.png" })).toBe(false);
  });

  it("shows a text case exactly as before", () => {
    const blocks = buildContext(agentTrace, { trace: "Step 1: a", _item_id: "x" }, 1_000_000_001);
    expect(blocks).toEqual([{ label: "Agent trace", value: "Step 1: a" }]);
  });
});

describe("which config and ceiling a pool runs on", () => {
  const projectConfig = {
    reviewers_per_item: 3,
    schema: { fields: {} },
    _webhook_secret: "s3cret",
    _ingest_keys: ["k"],
  };

  it("a pool reads its project's config and ceiling, not its own copy", () => {
    const facts = poolFacts({
      id: "p",
      project_id: "proj",
      eval_config: { reviewers_per_item: 9, schema: { fields: { stale: { type: "text" } } } },
      maximum_annotations: 9,
      project: { eval_config: projectConfig },
    });
    expect(facts?.projectId).toBe("proj");
    expect(facts?.maxAnnotations).toBe(3);
    expect(facts?.evalConfig).toEqual({ reviewers_per_item: 3, schema: { fields: {} } });
  });

  it("never lets a project's internal keys, the webhook secret among them, through", () => {
    expect(JSON.stringify(clinicianConfig(projectConfig))).not.toContain("s3cret");
    const facts = poolFacts({ id: "p", project_id: "proj", project: { eval_config: projectConfig } });
    expect(JSON.stringify(facts?.evalConfig)).not.toContain("s3cret");
  });

  it("serves nothing from a pool with no project, whatever its own columns say", () => {
    // Its own config and ceiling are never a reason to serve it.
    expect(poolFacts({ id: "p", eval_config: { reviewers_per_item: 2 }, maximum_annotations: 2 })).toBeNull();
    expect(poolFacts({ id: "p", project_id: null, project: { eval_config: projectConfig } })).toBeNull();
  });

  it("reads neither the legacy project id nor the store flag", () => {
    expect(POOL_SELECT).not.toMatch(/ls_project_id|task_store/);
  });

  it.each([
    [{ reviewers_per_item: 3 }, 3],
    [{}, 1],
    [{ reviewers_per_item: "two" }, 1],
    [{ reviewers_per_item: 0 }, 1],
    [null, 1],
  ])("reads the ceiling the way HEALTH does: %p -> %p", (config, expected) => {
    expect(ceilingFrom(config as Record<string, unknown> | null)).toBe(expected);
  });
});

describe("task numbers", () => {
  it("start at a billion; anything else is not a task", () => {
    expect(isTaskNumber(TASK_NO_FLOOR)).toBe(true);
    expect(isTaskNumber(18204)).toBe(false);
    expect(isTaskNumber(1)).toBe(false);
    expect(isTaskNumber(1_000_000_000.5)).toBe(false);
  });
});

describe("the next case after a submit", () => {
  const t = (id: number, total = 0, labeled = false): TaskState => ({
    id,
    total_annotations: total,
    is_labeled: labeled,
  });

  it("is the lowest-numbered case on offer that this clinician has not seen", () => {
    const tasks = [t(1_000_000_003), t(1_000_000_001), t(1_000_000_002)];
    expect(selectNextTask(tasks, new Set([1_000_000_001]), 2)?.id).toBe(1_000_000_002);
  });

  it("skips cases at the ceiling and cases already finished", () => {
    const tasks = [t(1_000_000_001, 2), t(1_000_000_002, 0, true), t(1_000_000_003, 1)];
    expect(selectNextTask(tasks, new Set(), 2)?.id).toBe(1_000_000_003);
    expect(selectNextTask(tasks.slice(0, 2), new Set(), 2)).toBeNull();
  });
});
