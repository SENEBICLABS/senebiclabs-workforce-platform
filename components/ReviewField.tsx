"use client";

import { Star } from "lucide-react";
import type { Field } from "@/lib/api";

export type Answers = Record<string, unknown>;

/** Mirrors the server's rule so a hidden field is never shown or sent. */
export function isVisible(field: Field, answers: Answers): boolean {
  if (!field.visible_when) return true;
  const match = field.visible_when.match(/^\s*(\w+)\s*(==|!=)\s*(.+?)\s*$/);
  if (!match) return true;
  const [, name, op, expected] = match;
  const actual = answers[name];
  return op === "==" ? actual === expected : actual !== expected;
}

function choicesFor(field: Field, poolClasses: string[]): string[] {
  if (field.type === "single") return field.options ?? [];
  return field.classes ?? poolClasses;
}

const CONTROL =
  "focusable w-full rounded-card border bg-surface px-3 text-body text-ink transition-colors";

/**
 * Renders one field from a project's eval_config. Nothing here is
 * client-specific: the type, label, hint, options and requiredness all arrive
 * from the config, so a new project renders without a UI change.
 */
export function ReviewField({
  field,
  answers,
  poolClasses,
  onChange,
  invalid,
}: {
  field: Field;
  answers: Answers;
  poolClasses: string[];
  onChange: (key: string, value: unknown) => void;
  invalid?: boolean;
}) {
  const value = answers[field.name];
  const hintId = field.hint ? `${field.name}-hint` : undefined;
  const border = invalid ? "border-danger" : "border-hairline";
  const options = choicesFor(field, poolClasses);

  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 text-body font-semibold text-ink">
        {field.title}
        {field.required && (
          <>
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </legend>

      {field.hint && (
        <p id={hintId} className="mb-3 text-[15px] text-muted">
          {field.hint}
        </p>
      )}

      {(field.type === "single" || field.type === "from_classes") &&
        (options.length > 6 ? (
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            aria-describedby={hintId}
            aria-invalid={invalid || undefined}
            className={`${CONTROL} ${border} h-10`}
          >
            <option value="">Select one…</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <div className="space-y-2" role="radiogroup" aria-describedby={hintId}>
            {options.map((option) => {
              const selected = value === option;
              return (
                <label
                  key={option}
                  className={`flex cursor-pointer items-center gap-3 rounded-card border px-3 py-2.5 transition-colors ${
                    selected
                      ? "border-accent bg-accent-soft"
                      : `${border} hover:bg-accent-soft`
                  }`}
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={option}
                    checked={selected}
                    onChange={() => onChange(field.name, option)}
                    className="focusable h-4 w-4 shrink-0 accent-accent"
                  />
                  <span className="text-body text-ink">{option}</span>
                </label>
              );
            })}
          </div>
        ))}

      {field.type === "scale" && (
        <div
          className="flex items-center gap-1"
          role="radiogroup"
          aria-label={field.title}
          aria-describedby={hintId}
        >
          {Array.from({ length: field.max ?? 5 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} of ${field.max ?? 5}`}
              onClick={() => onChange(field.name, n)}
              className="focusable rounded-btn p-1 transition-transform duration-150 hover:scale-110"
            >
              <Star
                size={22}
                aria-hidden="true"
                className={
                  typeof value === "number" && value >= n
                    ? "fill-accent text-accent"
                    : "text-hairline"
                }
              />
            </button>
          ))}
          {typeof value === "number" && (
            <span className="tnum ml-2 text-[15px] text-muted">
              {value} of {field.max ?? 5}
            </span>
          )}
        </div>
      )}

      {field.type === "text" && (
        <textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.name, e.target.value)}
          aria-describedby={hintId}
          aria-invalid={invalid || undefined}
          rows={field.rows ?? 4}
          placeholder="Type your assessment…"
          className={`${CONTROL} ${border} resize-y py-2.5 placeholder:text-placeholder`}
        />
      )}

      {field.type === "flag" && (
        <label
          className={`flex cursor-pointer items-center gap-3 rounded-card border px-3 py-2.5 transition-colors ${
            value ? "border-accent bg-accent-soft" : `${border} hover:bg-accent-soft`
          }`}
        >
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) =>
              onChange(field.name, e.target.checked ? (field.label ?? "Yes") : "")
            }
            aria-describedby={hintId}
            className="focusable h-4 w-4 shrink-0 accent-accent"
          />
          <span className="text-body text-ink">{field.label ?? field.title}</span>
        </label>
      )}

      {field.type === "structured" && (
        <div className="space-y-3">
          <div className="flex gap-2" role="radiogroup" aria-describedby={hintId}>
            {["Yes", "No"].map((option) => {
              const selected = (value ?? "No") === option;
              return (
                <label
                  key={option}
                  className={`flex flex-1 cursor-pointer items-center justify-center rounded-card border px-3 py-2.5 transition-colors ${
                    selected
                      ? "border-accent bg-accent-soft font-semibold"
                      : `${border} hover:bg-accent-soft`
                  }`}
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={option}
                    checked={selected}
                    onChange={() => onChange(field.name, option)}
                    className="sr-only"
                  />
                  <span className="text-body text-ink">{option}</span>
                </label>
              );
            })}
          </div>

          {value === "Yes" && (
            <div className="border-l-2 border-accent-soft pl-4">
              <label
                htmlFor={`${field.name}_finding`}
                className="mb-1.5 block text-[15px] font-semibold text-ink"
              >
                Which finding?
              </label>
              <select
                id={`${field.name}_finding`}
                value={(answers[`${field.name}_finding`] as string) ?? ""}
                onChange={(e) =>
                  onChange(`${field.name}_finding`, e.target.value)
                }
                aria-invalid={invalid || undefined}
                className={`${CONTROL} ${border} h-10`}
              >
                <option value="">Select one…</option>
                {options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {field.type === "spans" && (
        <SpanPicker
          field={field}
          value={(value as Span[]) ?? []}
          options={options}
          onChange={(spans) => onChange(field.name, spans)}
          border={border}
        />
      )}
    </fieldset>
  );
}

interface Span {
  start: number;
  end: number;
  text: string;
  label: string;
}

/**
 * Select text in the passage, then tag the selection. Kept deliberately plain:
 * the server stores start/end offsets against the same string shown here.
 */
function SpanPicker({
  field,
  value,
  options,
  onChange,
  border,
}: {
  field: Field;
  value: Span[];
  options: string[];
  onChange: (spans: Span[]) => void;
  border: string;
}) {
  const source = (field.label ?? "") as string;

  const capture = (label: string) => {
    const selection = window.getSelection();
    const text = selection?.toString() ?? "";
    if (!text) return;
    const start = source.indexOf(text);
    onChange([
      ...value,
      { start: start < 0 ? 0 : start, end: (start < 0 ? 0 : start) + text.length, text, label },
    ]);
    selection?.removeAllRanges();
  };

  return (
    <div className="space-y-3">
      {source && (
        <p
          className={`rounded-card border px-3 py-2.5 text-body leading-relaxed text-ink ${border}`}
        >
          {source}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {options.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => capture(label)}
            className="focusable rounded-btn border border-hairline bg-surface px-3 py-1.5 text-[15px] font-semibold text-ink transition-colors hover:bg-accent-soft"
          >
            Tag selection as {label}
          </button>
        ))}
      </div>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((span, i) => (
            <li
              key={`${span.start}-${span.label}-${i}`}
              className="flex items-center justify-between gap-3 rounded-card bg-canvas px-3 py-2"
            >
              <span className="min-w-0 truncate text-[15px] text-ink">
                <span className="font-semibold">{span.label}</span> — “{span.text}”
              </span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                aria-label={`Remove ${span.label} tag`}
                className="focusable shrink-0 rounded-btn px-2 text-[15px] font-semibold text-accent hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
