/**
 * The button's visual recipe, with no "use client" on it.
 *
 * Deliberately separate from Button.tsx. That file is a client component, and
 * anything exported from it — even a pure string function — cannot be called
 * from a server component. Links that look like buttons are rendered on the
 * server, so the recipe has to live somewhere both sides can reach.
 */

export type Variant = "primary" | "light" | "secondary" | "ghost" | "danger";
export type Size = "sm" | "md" | "lg";

export const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-on-fill hover:bg-accent-hover disabled:hover:bg-accent",
  // The public site's call to action: the text's own white, filled, so the one
  // thing to press reads as the brightest thing on a black page.
  light: "bg-ink text-canvas hover:bg-strong disabled:hover:bg-ink",
  secondary:
    "bg-surface text-ink border border-hairline hover:bg-accent-soft disabled:hover:bg-surface",
  ghost: "bg-transparent text-muted hover:bg-accent-soft hover:text-accent",
  danger: "bg-danger text-on-fill hover:brightness-110",
};

export const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[15px]",
  md: "h-9 px-4 text-[15px]",
  lg: "h-11 px-5 text-[15px]",
};

/** Only a real button can be disabled, so these stay off the shared recipe. */
export const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `focusable inline-flex items-center justify-center gap-2 rounded-btn font-semibold transition-colors duration-150 ${VARIANT[variant]} ${SIZE[size]} ${className}`.trim();
}
