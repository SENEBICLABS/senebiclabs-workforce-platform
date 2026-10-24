import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  answersToLsResult,
  findingOptionsFor,
  isVisible,
  normalizeConfig,
  optionsFor,
  type Field,
  type RawEvalConfig,
} from "../lib/eval-config";

/**
 * The answer format is the contract between this app and HEALTH: HEALTH's
 * parser, consensus, scoring and client delivery all read what
 * answersToLsResult writes. This file pins that output, for every one of
 * HEALTH's templates, in a golden file HEALTH's own tests then push through
 * Postgres and its scoring path (HEALTH tests/sql/test_pipeline_sql.py).
 *
 * If the translator changes on purpose, regenerate and let HEALTH's tests say
 * whether the change is safe:
 *
 *     UPDATE_FIXTURES=1 npx vitest run tests/wire-format.test.ts
 *
 * The template configs come from HEALTH (tests/fixtures/template-configs.json
 * there), read from HEALTH_REPO, by default the sibling checkout.
 */

const HEALTH = process.env.HEALTH_REPO ?? resolve(__dirname, "../../../HEALTH");
const TEMPLATES = resolve(HEALTH, "tests/fixtures/template-configs.json");
const GOLDEN = resolve(__dirname, "fixtures/wire-answers.json");

/** What the clinician reads; every context key gets a passage with a phrase to highlight. */
function contentFor(raw: RawEvalConfig): Record<string, string> {
  const content: Record<string, string> = { case_id: "CASE-1", prediction: "Normal" };
  for (const block of raw.schema?.context ?? []) {
    if (block.key) content[block.key] = `${block.label ?? block.key}: the patient reports chest pain at rest.`;
  }
  return content;
}

function lastContextText(raw: RawEvalConfig, content: Record<string, string>): string {
  const keys = (raw.schema?.context ?? []).map((b) => b.key).filter(Boolean) as string[];
  return keys.length ? content[keys[keys.length - 1]] : "";
}

/** Every field answered, picking the answer that keeps dependent fields visible. */
function fullAnswers(fields: Field[], classes: string[], passage: string) {
  const answers: Record<string, unknown> = {};
  for (const f of fields) {
    switch (f.type) {
      case "single": {
        const opts = optionsFor(f, classes);
        answers[f.name] = opts.includes("Incorrect") ? "Incorrect" : (opts[1] ?? opts[0]);
        break;
      }
      case "from_classes":
        answers[f.name] = optionsFor(f, classes)[1] ?? optionsFor(f, classes)[0];
        break;
      case "scale":
        answers[f.name] = Math.min(4, f.max ?? 5);
        break;
      case "number":
        answers[f.name] = 3;
        break;
      case "text":
        answers[f.name] = `${f.name} in the clinician's words`;
        break;
      case "flag":
        answers[f.name] = f.label ?? "Yes";
        break;
      case "structured":
        answers[f.name] = "Yes";
        answers[`${f.name}_finding`] = findingOptionsFor(f, classes)?.[0] ?? "Missed ST elevation";
        break;
      case "spans": {
        const start = passage.indexOf("chest pain");
        answers[f.name] = [
          { start, end: start + "chest pain".length, text: "chest pain", label: optionsFor(f, classes)[0] },
        ];
        break;
      }
    }
  }
  return answers;
}

/** Only what is required, with the first option: optional structured fields left blank. */
function minimalAnswers(fields: Field[], classes: string[]) {
  const answers: Record<string, unknown> = {};
  for (const f of fields) {
    if (!f.required) continue;
    if (f.type === "single" || f.type === "from_classes") answers[f.name] = optionsFor(f, classes)[0];
    else if (f.type === "text") answers[f.name] = `${f.name} briefly`;
    else if (f.type === "scale") answers[f.name] = 1;
    else if (f.type === "number") answers[f.name] = f.min ?? 1;
  }
  return answers;
}

function build() {
  const { templates } = JSON.parse(readFileSync(TEMPLATES, "utf8")) as {
    templates: Record<string, RawEvalConfig>;
  };
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(templates).sort()) {
    const config = normalizeConfig(raw);
    const content = contentFor(raw);
    const passage = lastContextText(raw, content);
    const sets: Record<string, unknown> = {};
    for (const [label, answers] of [
      ["full", fullAnswers(config.fields, config.classes, passage)],
      ["minimal", minimalAnswers(config.fields, config.classes)],
    ] as const) {
      sets[label] = {
        answers,
        visible: config.fields.filter((f) => isVisible(f, answers)).map((f) => [f.name, f.type]),
        result: answersToLsResult(config, answers),
      };
    }
    out[name] = { content, sets };
  }
  return out;
}

describe("the answer format HEALTH consumes", () => {
  it.skipIf(!existsSync(TEMPLATES))("matches the golden file for every HEALTH template", () => {
    const built = build();
    if (process.env.UPDATE_FIXTURES === "1") {
      writeFileSync(
        GOLDEN,
        JSON.stringify(
          {
            _generated_by:
              "tests/wire-format.test.ts with UPDATE_FIXTURES=1, from HEALTH tests/fixtures/template-configs.json",
            templates: built,
          },
          null,
          1
        ) + "\n"
      );
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")).templates;
    expect(built).toEqual(golden);
  });

  it.skipIf(!existsSync(TEMPLATES))("writes every visible answered field, so nothing is dropped", () => {
    for (const [name, t] of Object.entries(build()) as [string, { sets: Record<string, { answers: Record<string, unknown>; visible: [string, string][]; result: { from_name: string }[] }> }][]) {
      for (const set of Object.values(t.sets)) {
        const written = new Set(set.result.map((r) => r.from_name));
        for (const [field] of set.visible) {
          if (set.answers[field] !== undefined) {
            expect(written.has(field), `${name}: ${field}`).toBe(true);
          }
        }
      }
    }
  });
});
