"use client";

import React from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-on-fill hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "bg-surface text-ink border border-hairline hover:bg-accent-soft disabled:hover:bg-surface",
  ghost: "bg-transparent text-muted hover:text-ink hover:bg-canvas",
  danger: "bg-danger text-on-fill hover:brightness-110",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[14px]",
  lg: "h-11 px-5 text-[14px]",
};

/**
 * The button recipe, separated from the element.
 *
 * Anything that navigates has to be an anchor rather than a button, so those
 * cannot use the component and were copying these classes by hand. Two copies
 * had already drifted from this one. Exporting the recipe means a link that
 * looks like a button stays looking like this button.
 */
export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `focusable inline-flex items-center justify-center gap-2 rounded-btn font-semibold transition-colors duration-150 ${VARIANT[variant]} ${SIZE[size]} ${className}`.trim();
}

/** Only a real button can be disabled, so these stay off the shared recipe. */
const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`${buttonClass({ variant, size })} ${DISABLED} ${className}`}
      {...props}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
