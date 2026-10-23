import React from "react";
import { ChevronDown } from "lucide-react";

/**
 * Form controls, one recipe for every page.
 *
 * Each page used to style its own inputs, so the sign-in field, the invite
 * field and the workspace's text boxes had three heights and two radii. These
 * are plain elements with the platform's look on them: every native attribute
 * passes straight through, and nothing here holds state.
 */

const BASE =
  "w-full rounded-btn border bg-canvas-top text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-placeholder outline-none focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-accent/15 disabled:cursor-not-allowed disabled:opacity-50";

/** The control's class, for the few places that render a raw element. */
export function controlClass(invalid?: boolean, className = "") {
  return `${BASE} ${
    invalid
      ? "border-danger/70 focus-visible:border-danger focus-visible:ring-danger/15"
      : "border-hairline-strong hover:border-accent/55"
  } ${className}`;
}

export function Label({
  htmlFor,
  children,
  optional,
  className = "",
}: {
  htmlFor?: string;
  children: React.ReactNode;
  optional?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`mb-2 flex items-baseline justify-between gap-3 text-[14px] font-semibold text-strong ${className}`}
    >
      <span>{children}</span>
      {optional && <span className="text-[13px] font-normal text-subtle">Optional</span>}
    </label>
  );
}

/**
 * Height and type size travel together, as a size rather than as classes, so a
 * caller never has to override one utility with another of the same property.
 */
export type ControlSize = "sm" | "md";
const SIZE: Record<ControlSize, string> = {
  sm: "h-9 text-[14px]",
  md: "h-11 text-body",
};

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  controlSize?: ControlSize;
};

export function Input({ invalid, controlSize = "md", className = "", ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={controlClass(invalid, `${SIZE[controlSize]} px-3.5 ${className}`)}
      {...props}
    />
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export function Textarea({ invalid, className = "", ...props }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={controlClass(invalid, `resize-y px-3.5 py-3 text-body leading-relaxed ${className}`)}
      {...props}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  controlSize?: ControlSize;
  /** Classes for the wrapper, which is what sizes the control in a row. */
  wrapperClassName?: string;
};

/** A native select, so it keeps the platform picker on a phone, with our chevron. */
export function Select({
  invalid,
  controlSize = "md",
  className = "",
  wrapperClassName = "",
  children,
  ...props
}: SelectProps) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select
        aria-invalid={invalid || undefined}
        className={controlClass(invalid, `${SIZE[controlSize]} cursor-pointer appearance-none pl-3.5 pr-10 ${className}`)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

export function FieldHint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-2 text-[14px] leading-snug text-subtle">
      {children}
    </p>
  );
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-2 text-[14px] font-medium text-danger">
      {children}
    </p>
  );
}
