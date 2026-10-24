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
import {
  ceilingFrom,
  clinicianConfig,
  LEGACY_POOL_SELECT,
  POOL_SELECT,
  poolFacts,
  withPoolColumns,
} from "../lib/gate";
import { isNativeTaskId, NATIVE_TASK_FLOOR } from "../lib/taskstore";

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

  it("a native pool reads its project's config and ceiling, not its own copy", () => {
    const facts = poolFacts({
      id: "p",
      project_id: "proj",
      eval_config: { reviewers_per_item: 9, schema: { fields: { stale: { type: "text" } } } },
      maximum_annotations: 9,
      project: { task_store: "native", eval_config: projectConfig },
    });
    expect(facts.native).toBe(true);
    expect(facts.maxAnnotations).toBe(3);
    expect(facts.evalConfig).toEqual({ reviewers_per_item: 3, schema: { fields: {} } });
  });

  it("never lets a project's internal keys, the webhook secret among them, through", () => {
    expect(JSON.stringify(clinicianConfig(projectConfig))).not.toContain("s3cret");
    const lsPool = poolFacts({ id: "p", eval_config: projectConfig, maximum_annotations: 2 });
    expect(JSON.stringify(lsPool.evalConfig)).not.toContain("s3cret");
  });

  it("a Label Studio pool keeps its own config and ceiling", () => {
    const facts = poolFacts({
      id: "p",
      project_id: "proj",
      eval_config: { reviewers_per_item: 2 },
      maximum_annotations: 2,
      project: { task_store: "label_studio", eval_config: projectConfig },
    });
    expect(facts.native).toBe(false);
    expect(facts.maxAnnotations).toBe(2);
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

describe("telling the stores' task ids apart", () => {
  it("native numbers start where Label Studio's could never reach", () => {
    expect(isNativeTaskId(NATIVE_TASK_FLOOR)).toBe(true);
    expect(isNativeTaskId(18204)).toBe(false);
    expect(isNativeTaskId(1)).toBe(false);
    expect(isNativeTaskId(1_000_000_000.5)).toBe(false);
  });
});

describe("deploying before the migrations", () => {
  it("retries pool queries without the native columns only when the database lacks them", async () => {
    for (const code of ["42703", "PGRST200", "PGRST204"]) {
      const seen: string[] = [];
      const out = await withPoolColumns(async (select) => {
        seen.push(select);
        return select === POOL_SELECT
          ? { data: null, error: { code } }
          : { data: [{ id: "p" }], error: null };
      });
      expect(seen).toEqual([POOL_SELECT, LEGACY_POOL_SELECT]);
      expect(out.data).toEqual([{ id: "p" }]);
    }
  });

  it("never retries for any other failure, and never hides it", async () => {
    const seen: string[] = [];
    const out = await withPoolColumns(async (select) => {
      seen.push(select);
      return { data: null, error: { code: "57014" } }; // a timeout, say
    });
    expect(seen).toEqual([POOL_SELECT]);
    expect(out.error).toEqual({ code: "57014" });
  });

  it("serves every pool as a Label Studio pool from the legacy columns", () => {
    const facts = poolFacts({ id: "p", eval_config: { reviewers_per_item: 2 }, maximum_annotations: 2 });
    expect(facts.native).toBe(false);
    expect(facts.projectId).toBeNull();
  });
});
