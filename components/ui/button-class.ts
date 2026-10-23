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
  primary:
    "bg-accent text-on-fill shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] hover:bg-accent-hover disabled:hover:bg-accent",
  // The public site's call to action: the text's own white, filled, so the one
  // thing to press reads as the brightest thing on a black page.
  light: "bg-ink text-canvas hover:bg-strong disabled:hover:bg-ink",
  secondary:
    "bg-surface-raised text-ink border border-hairline-strong hover:border-accent/60 hover:bg-accent-soft disabled:hover:bg-surface-raised disabled:hover:border-hairline-strong",
  ghost: "bg-transparent text-muted hover:bg-accent-soft hover:text-ink",
  danger: "bg-danger text-[#3B0A0A] hover:brightness-110",
};

export const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[14px]",
  md: "h-10 px-4 text-[15px]",
  lg: "h-12 px-6 text-[15px]",
};

/** Only a real button can be disabled, so these stay off the shared recipe. */
export const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `focusable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-btn font-semibold transition-[background-color,border-color,color,filter,transform] duration-150 active:translate-y-px disabled:active:translate-y-0 ${VARIANT[variant]} ${SIZE[size]} ${className}`.trim();
}
