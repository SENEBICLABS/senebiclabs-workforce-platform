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
    "bg-accent text-on-fill shadow-[0_6px_16px_-6px_rgb(41_205_156/0.7)] hover:bg-accent-hover disabled:hover:bg-accent",
  // The black pill, for the secondary call to action. On a black band the
  // tokens invert and it becomes a white pill.
  light: "bg-ink text-canvas hover:bg-strong disabled:hover:bg-ink",
  secondary:
    "bg-surface-raised text-ink border border-hairline-strong hover:border-accent/60 hover:bg-accent-soft disabled:hover:bg-surface-raised disabled:hover:border-hairline-strong",
  ghost: "bg-transparent text-muted hover:bg-accent-soft hover:text-ink",
  danger: "bg-danger text-white hover:brightness-110",
};

export const SIZE: Record<Size, string> = {
  sm: "h-8 px-4 text-[14px]",
  md: "h-10 px-5 text-[15px]",
  lg: "h-12 px-7 text-[16px]",
};

/** Only a real button can be disabled, so these stay off the shared recipe. */
export const DISABLED = "disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass({
  variant = "primary",
  size = "md",
  className = "",
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return `focusable inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-display font-bold transition-[background-color,border-color,color,filter,transform] duration-150 active:translate-y-px disabled:active:translate-y-0 ${VARIANT[variant]} ${SIZE[size]} ${className}`.trim();
}
