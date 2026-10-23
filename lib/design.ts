/**
 * Design system constants.
 *
 * The Tailwind theme in app/globals.css is the source of truth for anything
 * expressible as a utility class. These mirrors exist for the places that need
 * real JS values — recharts fills, inline SVG strokes.
 */

export const COLOR = {
  surface: "#FFFFFF",
  canvas: "#F5F7FA",
  track: "#E8EDF3",
  ink: "#1A1B1F",
  strong: "#32343A",
  muted: "#536170",
  subtle: "#646E7D",
  hairline: "#E4EBF3",
  accent: "#29CD9C",
  accentInk: "#087F5B",
  accentSoft: "#E6F9F2",
  onFill: "#06291D",
  focus: "#0050BD",
  warning: "#8A5300",
  danger: "#C2272D",
  info: "#0050BD",
  success: "#087F5B",
} as const;

export const RADIUS = {
  button: 999,
  control: 8,
  card: 14,
  pill: 999,
} as const;

/** Base spacing unit, in px. Card padding is 5 units, grid gap is 4. */
export const SPACE = 4;

export const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole-dollar currency, for axis ticks and large headline figures. */
export const CURRENCY_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
