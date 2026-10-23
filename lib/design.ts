/**
 * Design system constants.
 *
 * The Tailwind theme in app/globals.css is the source of truth for anything
 * expressible as a utility class. These mirrors exist for the places that need
 * real JS values — recharts fills, inline SVG strokes.
 */

export const COLOR = {
  surface: "#0C0E0E",
  surfaceRaised: "#141817",
  canvas: "#000000",
  ink: "#FFFFFF",
  strong: "#E6F0ED",
  muted: "#A3BDB6",
  subtle: "#739089",
  hairline: "rgba(79, 191, 164, 0.22)",
  accent: "#4FBFA4",
  accentHover: "#6ADABD",
  accentSoft: "#0E2B26",
  warning: "#FBBF24",
  danger: "#FCA5A5",
  info: "#93C5FD",
  success: "#6EE7B7",
  rail: "#050707",
} as const;

export const RADIUS = {
  button: 8,
  card: 12,
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
