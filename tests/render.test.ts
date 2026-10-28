import { describe, expect, it } from "vitest";
import fixture from "./fixtures/render-parity.json";
import { renderTaskData, renderValue } from "../lib/render";

/**
 * The task store must show a case exactly as HEALTH's render_value renders
 * it. The fixture is that function's own output (see its _generated_by note),
 * so this compares against the Python, not against a guess at it.
 */
describe("renderValue matches HEALTH's render_value", () => {
  for (const [i, c] of fixture.cases.entries()) {
    it(`case ${i}: ${JSON.stringify(c.input).slice(0, 40)}`, () => {
      expect(renderValue(c.input)).toEqual(c.rendered);
    });
  }
});

describe("renderTaskData", () => {
  it("drops internal keys, including a gold answer", () => {
    const data = renderTaskData({
      prompt: "chest pain",
      _gold_expected: { verdict: "Correct" },
      _item_id: "x",
    });
    expect(data).toEqual({ prompt: "chest pain" });
  });

  it("renders a trace and leaves strings alone", () => {
    const data = renderTaskData({ trace: ["a", "b"], output: "fine" });
    expect(data).toEqual({ trace: "Step 1: a\n\nStep 2: b", output: "fine" });
  });
});
