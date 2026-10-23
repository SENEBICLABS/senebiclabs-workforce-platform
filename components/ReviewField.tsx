"use client";

import { Check } from "lucide-react";
import type { Field } from "@/lib/api";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { findingOptionsFor } from "@/lib/eval-config";

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

/**
 * An option the clinician picks, drawn as a card. The native input stays in it,
 * visually hidden, so the keyboard and a screen reader work exactly as they do
 * on a plain radio; the ring shows where focus is.
 */
const OPTION =
  "flex cursor-pointer items-center gap-3 rounded-btn border px-4 py-3 transition-[background-color,border-color] duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";

function optionState(selected: boolean, border: string) {
  return selected
    ? "border-accent bg-accent-soft"
    : `${border} bg-canvas-top hover:border-accent/55 hover:bg-accent-soft/40`;
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors ${
        selected ? "border-accent" : "border-hairline-strong"
      }`}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  );
}

/**
 * Renders one field from a project's eval_config. Nothing here is
 * client-specific: the type, label, hint, options and requiredness all arrive
 * from the config, so a new project renders without a UI change.
 */
/**
 * Option text as a clinician should read it.
 *
 * Options come from a pool's config, where they are written as data: "correct",
 * "partially correct". Only the first letter is touched, so MBBS, ECG and the
 * like are left exactly as the config spells them.
 */
function optionLabel(option: string): string {
  return option.charAt(0).toUpperCase() + option.slice(1);
}

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
  // null means the follow-up is open-ended and the clinician types it.
  const findingChoices = findingOptionsFor(field, poolClasses);

  return (
    <fieldset className="border-0 p-0">
      <legend className="mb-1 text-[16px] font-semibold leading-snug text-ink">
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
        <p id={hintId} className="mb-3 text-[15px] leading-snug text-muted">
          {field.hint}
        </p>
      )}

      {!field.hint && <div className="mb-3" />}

      {(field.type === "single" || field.type === "from_classes") &&
        (options.length > 6 ? (
          <Select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(field.name, e.target.value)}
            aria-describedby={hintId}
            invalid={invalid}
          >
            <option value="">Select one…</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {optionLabel(option)}
              </option>
            ))}
          </Select>
        ) : (
          <div className="grid gap-2" role="radiogroup" aria-describedby={hintId}>
            {options.map((option) => {
              const selected = value === option;
              return (
                <label
                  key={option}
                  className={`${OPTION} ${optionState(selected, border)}`}
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={option}
                    checked={selected}
                    onChange={() => onChange(field.name, option)}
                    className="sr-only"
                  />
                  <RadioDot selected={selected} />
                  <span className={`text-[15px] ${selected ? "font-semibold text-ink" : "text-strong"}`}>
                    {optionLabel(option)}
                  </span>
                </label>
              );
            })}
          </div>
        ))}

      {field.type === "scale" && (
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`inline-flex rounded-btn border bg-canvas-top p-1 ${border}`}
            role="radiogroup"
            aria-label={field.title}
            aria-describedby={hintId}
          >
            {Array.from({ length: field.max ?? 5 }, (_, i) => i + 1).map((n) => {
              const on = typeof value === "number" && value >= n;
              const exact = value === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={exact}
                  aria-label={`${n} of ${field.max ?? 5}`}
                  onClick={() => onChange(field.name, n)}
                  className={`focusable tnum h-10 w-11 rounded-[6px] text-[15px] font-semibold transition-colors duration-150 ${
                    exact
                      ? "bg-accent text-on-fill"
                      : on
                        ? "bg-accent-soft text-accent"
                        : "text-muted hover:bg-accent-soft/60 hover:text-ink"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <span className="tnum text-[14px] text-subtle">
            {typeof value === "number"
              ? `${value} of ${field.max ?? 5}`
              : `1 is lowest, ${field.max ?? 5} is highest`}
          </span>
        </div>
      )}

      {field.type === "text" && (
        <Textarea
          value={(value as string) ?? ""}
          onChange={(e) => onChange(field.name, e.target.value)}
          aria-describedby={hintId}
          invalid={invalid}
          rows={field.rows ?? 4}
          placeholder="Type your assessment…"
        />
      )}

      {field.type === "flag" && (
        <label className={`${OPTION} ${optionState(Boolean(value), border)}`}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) =>
              onChange(field.name, e.target.checked ? (field.label ?? "Yes") : "")
            }
            aria-describedby={hintId}
            className="sr-only"
          />
          <span
            aria-hidden="true"
            className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-2 transition-colors ${
              value ? "border-accent bg-accent text-on-fill" : "border-hairline-strong"
            }`}
          >
            {Boolean(value) && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="text-[15px] text-ink">{field.label ?? field.title}</span>
        </label>
      )}

      {field.type === "structured" && (
        <div className="space-y-3">
          <div className="flex gap-2" role="radiogroup" aria-describedby={hintId}>
            {["Yes", "No"].map((option) => {
              // No default. This used to read (value ?? "No"), which showed No
              // as chosen before anyone had answered: a clinician who never touched
              // the field still submitted "no critical miss", and the safer-looking
              // answer was the one recorded by inaction.
              const selected = value === option;
              return (
                <label
                  key={option}
                  className={`${OPTION} flex-1 justify-center ${optionState(selected, border)}`}
                >
                  <input
                    type="radio"
                    name={field.name}
                    value={option}
                    checked={selected}
                    onChange={() => onChange(field.name, option)}
                    className="sr-only"
                  />
                  <RadioDot selected={selected} />
                  <span className={`text-[15px] ${selected ? "font-semibold text-ink" : "text-strong"}`}>
                    {option}
                  </span>
                </label>
              );
            })}
          </div>

          {value === "Yes" && (
            <div className="animate-rise rounded-btn border-l-2 border-accent bg-accent-soft/30 py-3 pl-4 pr-3">
              <label
                htmlFor={`${field.name}_finding`}
                className="mb-1.5 block text-[15px] font-semibold text-ink"
              >
                {field.finding_label ?? "Which finding?"}
              </label>
              {/*
                A picker only where the field offers findings to pick from.
                This used to be a dropdown over the pool's classes whatever the
                follow-up asked, so in a pool whose classes are answer
                categories it asked which red flag was missed and offered
                "Normal" and "Borderline". There was no right answer to give.
              */}
              {findingChoices ? (
                <Select
                  id={`${field.name}_finding`}
                  value={(answers[`${field.name}_finding`] as string) ?? ""}
                  onChange={(e) =>
                    onChange(`${field.name}_finding`, e.target.value)
                  }
                  invalid={invalid}
                >
                  <option value="">Select one…</option>
                  {findingChoices.map((option) => (
                    <option key={option} value={option}>
                      {optionLabel(option)}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  type="text"
                  id={`${field.name}_finding`}
                  value={(answers[`${field.name}_finding`] as string) ?? ""}
                  onChange={(e) =>
                    onChange(`${field.name}_finding`, e.target.value)
                  }
                  invalid={invalid}
                  placeholder="In your own words"
                />
              )}
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
          className={`rounded-btn border bg-canvas-top px-4 py-3 text-body leading-relaxed text-ink selection:bg-accent/45 ${border}`}
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
            className="focusable rounded-full border border-hairline-strong bg-surface-raised px-3.5 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:border-accent/60 hover:bg-accent-soft"
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
              className="flex items-center justify-between gap-3 rounded-btn border border-hairline-soft bg-canvas-top px-3 py-2"
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
