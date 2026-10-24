/**
 * Item content as a clinician reads it.
 *
 * On Label Studio, HEALTH rendered each task's content before sending it
 * (labelstudio.py `render_value`): a structured value such as an agent trace,
 * sent as a list of steps, became numbered readable text. The native store
 * serves the stored content as it is, so the rendering happens here instead,
 * and must produce exactly the same text, character for character, or the
 * same case would read differently depending on which store served it.
 * tests/render.test.ts holds it to fixtures generated from the Python.
 *
 * Python's own formatting is reproduced where it shows: json.dumps puts a
 * space after ":" and ",", and str() spells true/false/null as True, False and
 * None. Internal keys (anything starting with "_") are never rendered.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** What a step IS comes before what it contains (labelstudio.py _STEP_LEAD_KEYS). */
const STEP_LEAD_KEYS = ["step", "type", "kind", "role", "action", "tool", "name"];

function stepKeyOrder(step: Record<string, Json>): string[] {
  const keys = Object.keys(step);
  const lead = STEP_LEAD_KEYS.filter((k) => keys.includes(k));
  return [...lead, ...keys.filter((k) => !lead.includes(k))];
}

/** Python's json.dumps(x, ensure_ascii=False) with its default separators. */
function pyJsonDumps(x: Json): string {
  if (x === null) return "null";
  if (Array.isArray(x)) return `[${x.map(pyJsonDumps).join(", ")}]`;
  if (typeof x === "object") {
    return `{${Object.entries(x)
      .map(([k, v]) => `${JSON.stringify(k)}: ${pyJsonDumps(v)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(x);
}

/** Python's str(x) for a JSON scalar. */
function pyStr(x: Json): string {
  if (x === null) return "None";
  if (x === true) return "True";
  if (x === false) return "False";
  return String(x);
}

function oneLine(x: Json): string {
  return x !== null && typeof x === "object" ? pyJsonDumps(x) : pyStr(x);
}

/** labelstudio.py render_value: lists and objects become text, scalars pass through. */
export function renderValue(value: unknown): Json {
  const v = value as Json;
  if (Array.isArray(v)) {
    return v
      .map((step, i) => {
        if (step !== null && typeof step === "object" && !Array.isArray(step)) {
          const body = stepKeyOrder(step)
            .map((k) => `   ${k}: ${oneLine(step[k])}`)
            .join("\n");
          return `Step ${i + 1}\n${body}`;
        }
        return `Step ${i + 1}: ${oneLine(step)}`;
      })
      .join("\n\n");
  }
  if (v !== null && typeof v === "object") {
    return Object.entries(v)
      .map(([k, x]) => `${k}: ${oneLine(x)}`)
      .join("\n");
  }
  return v;
}

/** The task payload a clinician is served: rendered content, internal keys dropped. */
export function renderTaskData(
  content: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content ?? {})) {
    if (key.startsWith("_")) continue;
    data[key] = renderValue(value);
  }
  return data;
}
