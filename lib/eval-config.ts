/**
 * eval_config is the whole contract between a client's project and this
 * portal. Adding a client means creating a project with its own config —
 * nothing here or in the UI is per-client.
 *
 * Types are shared with the browser; the translation below is server-only in
 * practice (only submit routes call it) and the client never sees LS shapes.
 */

export type FieldType =
  | "single"
  | "from_classes"
  | "scale"
  | "text"
  | "flag"
  | "structured"
  | "spans";

export interface Field {
  name: string;
  type: FieldType;
  title: string;
  hint?: string;
  options?: string[];
  classes?: string[];
  max?: number;
  rows?: number;
  label?: string;
  required?: boolean;
  /** e.g. "verdict==Has errors" — the field shows only when it holds. */
  visible_when?: string;

  /* The follow-up under a structured field: "Yes — and then what?" */

  /** The follow-up's own question, e.g. "Name the red flag". */
  finding_label?: string;
  /** The findings to choose from, when the answer is one of a known set. */
  finding_options?: string[];
  /** Use the pool's classes as the findings. Only true where they really are. */
  finding_from_classes?: boolean;
}

export interface ContextBlock {
  label: string;
  value: string;
}

export interface NormalizedConfig {
  title: string | null;
  purpose: "evaluate" | "label" | "create";
  instructions: string | null;
  fields: Field[];
  /** Pool-level classes, used by from_classes/structured fields with none of their own. */
  classes: string[];
}

/**
 * A field as it arrives in a pool's config, before normalisation.
 *
 * `title` is optional here and required on Field, because a config may leave it
 * out and normalizeConfig fills it in from the field's name. The type used to
 * demand it, which was a claim about client configs that none of them honour:
 * every field in the live lab-interpretation pool omits it.
 */
type RawField = Omit<Field, "name" | "title"> & { title?: string };
type RawFields = Record<string, RawField> | (RawField & { name: string })[];

interface RawSchema {
  fields?: RawFields;
  field_order?: string[];
  classes?: string[];
  context?: { key?: string; label?: string; content?: string }[];
  case_id_field?: string;
}

export interface RawEvalConfig {
  title?: string;
  purpose?: string;
  instructions?: string;
  schema?: RawSchema;
}

const PURPOSES = new Set(["evaluate", "label", "create"]);

/**
 * Accepts either fields shape.
 *
 * A list is authoritative for order. A dict is not: Postgres does not preserve
 * jsonb key order, so a config that cares about field order should either use a
 * list or supply `schema.field_order`.
 */
export function normalizeConfig(raw: RawEvalConfig | null): NormalizedConfig {
  const schema = raw?.schema ?? {};
  const rawFields = schema.fields;

  // Named but not yet titled: the fallback below is what makes these Fields.
  let named: (RawField & { name: string })[] = [];

  if (Array.isArray(rawFields)) {
    named = rawFields.filter((f) => f && f.name);
  } else if (rawFields && typeof rawFields === "object") {
    const entries = Object.entries(rawFields);
    const order = schema.field_order;
    if (Array.isArray(order) && order.length > 0) {
      const byName = new Map(entries);
      named = order
        .filter((name) => byName.has(name))
        .map((name) => ({ name, ...byName.get(name)! }));
      // Anything the order forgot still gets rendered, after the ordered ones.
      for (const [name, config] of entries) {
        if (!order.includes(name)) named.push({ name, ...config });
      }
    } else {
      // Postgres does not preserve jsonb key order, so Object.entries here is
      // whatever the server happened to store — not the author's order. Sort by
      // name so the render order is at least deterministic and reproducible.
      // A config that cares about order must supply `field_order` or a list.
      named = entries
        .map(([name, config]) => ({ name, ...config }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  // A config may omit `title`; fall back to the field name so a label always
  // shows. This is the step that turns a raw field into a Field.
  const fields: Field[] = named.map((f) => ({
    ...f,
    title: f.title || humanize(f.name),
  }));

  const purpose = raw?.purpose;

  return {
    title: raw?.title ?? null,
    purpose: (PURPOSES.has(purpose ?? "") ? purpose : "evaluate") as
      | "evaluate"
      | "label"
      | "create",
    instructions: raw?.instructions?.trim() || null,
    fields,
    classes: Array.isArray(schema.classes) ? schema.classes : [],
  };
}

function humanize(name: string): string {
  const spaced = name.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * The labelled, read-only blocks shown above the fields.
 *
 * Each entry names a key in the LS task payload. Keys the task does not carry
 * are dropped rather than rendered empty.
 */
export function buildContext(
  raw: RawEvalConfig | null,
  taskData: Record<string, unknown>
): ContextBlock[] {
  const declared = raw?.schema?.context;

  if (Array.isArray(declared) && declared.length > 0) {
    return declared
      .map((block) => {
        const key = block.key;
        const value =
          key && taskData[key] !== undefined
            ? String(taskData[key])
            : (block.content ?? "");
        return { label: block.label ?? humanize(key ?? ""), value };
      })
      .filter((b) => b.value !== "");
  }

  // No declared context: show the payload minus internal keys, so a new client
  // is readable before anyone writes a context block for it.
  return Object.entries(taskData)
    .filter(([key, value]) => !key.startsWith("_") && value != null && value !== "")
    .map(([key, value]) => ({ label: humanize(key), value: String(value) }));
}

export function caseIdFor(
  raw: RawEvalConfig | null,
  taskData: Record<string, unknown>
): string | null {
  const key = raw?.schema?.case_id_field ?? "case_id";
  const value = taskData[key];
  return value == null ? null : String(value);
}

/** A field shows unless its `visible_when` says otherwise. */
export function isVisible(
  field: Field,
  answers: Record<string, unknown>
): boolean {
  if (!field.visible_when) return true;
  const match = field.visible_when.match(/^\s*(\w+)\s*(==|!=)\s*(.+?)\s*$/);
  if (!match) return true;
  const [, name, op, expected] = match;
  const actual = answers[name];
  return op === "==" ? actual === expected : actual !== expected;
}

export function optionsFor(field: Field, poolClasses: string[]): string[] {
  if (field.type === "single") return field.options ?? [];
  return field.classes ?? poolClasses;
}

/**
 * What the follow-up under a structured field offers, or null for a text box.
 *
 * The follow-up used to be a dropdown over the pool's classes, always. That is
 * right only when the classes happen to answer the follow-up's question, and
 * usually they do not. In the lab-interpretation pool the classes are answer
 * categories — Normal, Borderline, Abnormal, Critical — while the follow-up
 * asks which red flag the output ignored. Every option was wrong, and a
 * clinician who answered Yes had no way to say what they meant.
 *
 * So the field says. An explicit list wins; the pool's classes are used only
 * where a field opts in, which is the model_evaluation case where the classes
 * genuinely are the findings; otherwise the finding is open-ended and the
 * clinician types it.
 *
 * Returning null rather than an empty array is the point: it distinguishes
 * "no list, so let them type" from "a list that came back empty". A field that
 * asks for classes where none exist falls through to a text box too, because a
 * picker with nothing in it is not an answer either.
 *
 * Exported so the form and the validator cannot disagree about it. They read
 * the same rule, so nothing can be offered that would then be refused.
 */
export function findingOptionsFor(
  field: Field,
  poolClasses: string[]
): string[] | null {
  if (field.finding_options?.length) return field.finding_options;
  if (field.finding_from_classes) {
    const classes = field.classes ?? poolClasses;
    return classes.length > 0 ? classes : null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Answers → Label Studio result. The browser never sees any of this.  */
/* ------------------------------------------------------------------ */

export interface LsResultEntry {
  from_name: string;
  to_name: string;
  type: string;
  value: Record<string, unknown>;
}

const TO_NAME = "image";

/**
 * Upper bound on a free-text answer. Generous for a clinical rationale, but
 * finite — an unbounded string reaches both Label Studio and the client's
 * deliverable, so it is rejected at the door rather than stored.
 */
export const MAX_TEXT_LENGTH = 20_000;

export class TranslationError extends Error {}

/**
 * Converts { fieldname: value } into the LS result array.
 *
 * Only visible fields are written, so a field hidden by `visible_when` never
 * lands in the annotation. Required-but-missing is a hard error: the submit
 * fails and the clinician keeps their answers.
 */
export function answersToLsResult(
  config: NormalizedConfig,
  answers: Record<string, unknown>
): LsResultEntry[] {
  const result: LsResultEntry[] = [];

  for (const field of config.fields) {
    if (!isVisible(field, answers)) continue;

    const value = answers[field.name];
    const empty =
      value === undefined ||
      value === null ||
      value === "" ||
      (Array.isArray(value) && value.length === 0);

    if (empty) {
      if (field.required) {
        throw new TranslationError(`"${field.title}" is required.`);
      }
      // Optional and unanswered: write nothing rather than an empty choice.
      if (field.type !== "structured") continue;
    }

    switch (field.type) {
      case "single":
      case "from_classes": {
        // An answer outside the configured set would flow straight into the
        // client's deliverable, so it is refused rather than recorded.
        const allowed = optionsFor(field, config.classes);
        const choice = String(value);
        if (allowed.length > 0 && !allowed.includes(choice)) {
          throw new TranslationError(
            `"${choice}" is not one of the options for "${field.title}".`
          );
        }
        result.push({
          from_name: field.name,
          to_name: TO_NAME,
          type: "choices",
          value: { choices: [choice] },
        });
        break;
      }

      case "flag": {
        result.push({
          from_name: field.name,
          to_name: TO_NAME,
          type: "choices",
          value: { choices: [String(value)] },
        });
        break;
      }

      case "scale": {
        const rating = Number(value);
        const max = field.max ?? 5;
        if (!Number.isInteger(rating)) {
          throw new TranslationError(`"${field.title}" must be a whole number.`);
        }
        if (rating < 1 || rating > max) {
          throw new TranslationError(
            `"${field.title}" must be between 1 and ${max}.`
          );
        }
        result.push({
          from_name: field.name,
          to_name: TO_NAME,
          type: "rating",
          value: { rating },
        });
        break;
      }

      case "text": {
        const text = String(value);
        if (text.length > MAX_TEXT_LENGTH) {
          throw new TranslationError(
            `"${field.title}" is too long — ${text.length.toLocaleString()} characters, limit ${MAX_TEXT_LENGTH.toLocaleString()}.`
          );
        }
        result.push({
          from_name: field.name,
          to_name: TO_NAME,
          type: "textarea",
          value: { text: [text] },
        });
        break;
      }

      case "structured": {
        // Always two entries: the Yes/No, then the finding picker.
        const yesNo = value === "Yes" ? "Yes" : "No";
        const finding = answers[`${field.name}_finding`];

        if (yesNo === "Yes" && (finding === undefined || finding === "")) {
          throw new TranslationError(
            `"${field.title}" needs a finding when the answer is Yes.`
          );
        }

        // An allow-list applies only where the field offers a list. A typed
        // finding is the answer to an open question, so checking it against the
        // pool's classes would refuse every correct answer — which is what used
        // to happen wherever the classes answered a different question.
        if (finding !== undefined && finding !== "") {
          const allowed = findingOptionsFor(field, config.classes);
          if (allowed && !allowed.includes(String(finding))) {
            throw new TranslationError(
              `"${finding}" is not one of the findings for "${field.title}".`
            );
          }
        }

        result.push({
          from_name: field.name,
          to_name: TO_NAME,
          type: "choices",
          value: { choices: [yesNo] },
        });
        result.push({
          from_name: `${field.name}_finding`,
          to_name: TO_NAME,
          type: "choices",
          value: { choices: finding ? [String(finding)] : [] },
        });
        break;
      }

      case "spans": {
        const spans = Array.isArray(value) ? value : [];
        for (const span of spans as {
          start: number;
          end: number;
          text: string;
          label: string;
        }[]) {
          result.push({
            from_name: field.name,
            to_name: TO_NAME,
            type: "labels",
            value: {
              start: span.start,
              end: span.end,
              text: span.text,
              labels: [span.label],
            },
          });
        }
        break;
      }
    }
  }

  return result;
}
