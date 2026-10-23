# Senebiclabs Design System

One system for the public site, the clinician app and the operator console: a
light ground, white cards, near-black type, one bright mint for every call to
action, black as the second accent, pill buttons, and heavy geometric headings.

The source of truth is the `@theme` block in `app/globals.css`. Everything below
is a utility class generated from it. `lib/design.ts` mirrors the values for the
rare place that needs a JS colour.

---

## Tokens

### Surfaces

| Token | Value | Use |
|---|---|---|
| `canvas` | `#F5F7FA` | The application's page |
| `canvas-top` | `#F9FAFC` | Table heads, recessed panels, option cards |
| `surface` / `surface-raised` | `#FFFFFF` | Cards, inputs, menus (menus lift by shadow) |
| `track` | `#E8EDF3` | Meter tracks, skeletons, the off switch |
| `rail` | `#FFFFFF` | Sidebar |

The public pages use `.ground-blend`: white with two soft mint glows.

### Text

| Token | Value | On white | Use |
|---|---|---|---|
| `ink` | `#1A1B1F` | 17:1 | Headings, values |
| `strong` | `#32343A` | 12:1 | Labels, lead copy |
| `muted` | `#536170` | 6.4:1 | Supporting copy |
| `subtle` | `#646E7D` | 5.1:1 | Captions, hints, timestamps |

### Brand and semantics

| Token | Value | Use |
|---|---|---|
| `accent` | `#29CD9C` | **Fills only**: primary buttons, selected states, bars, dots, big decorative numerals |
| `accent-ink` | `#087F5B` | The same green as **text and icons** (5.0:1) |
| `accent-soft` | `#E6F9F2` | Tinted backgrounds, active nav item |
| `on-fill` | `#06291D` | Text on a mint fill (7.4:1) |
| `focus` | `#0050BD` | Focus rings and outlines |
| `info` / `success` / `warning` / `danger` | `#0050BD` / `#087F5B` / `#8A5300` / `#C2272D` | Each with a light `-soft` chip colour |

Mint fails as text (2.0:1 on white, and white on mint is 2.0:1 too), so text on
a mint fill uses `on-fill`. Never put
`text-accent` on running text; use `text-accent-ink`.

### Black band

Add `dark` to a public `Section` (or the `theme-dark` class to any element) to get a
full-width black band. The class re-points the tokens (ink becomes white,
`accent-ink` becomes bright mint, hairlines become white at low alpha), so every
component inside renders correctly without a dark variant. Use one per page at most.

### Type

- Headings: **Montserrat**, 700–800, applied to
  `h1`–`h6` by element.
- Body: **IBM Plex Sans**.
- Codes (case ids, key caps): IBM Plex Mono.
- Eyebrows on public pages: `EYEBROW` in `components/landing/Section.tsx`. Montserrat
  800, uppercase, 0.3em tracking, `accent-ink`.
- `text-label` (chips, table heads): Montserrat 700, 11px, 0.1em tracking.

### Geometry, depth, motion

- Buttons are full pills (`rounded-full`, set in `buttonClass`).
- `rounded-btn` 8px for inputs, option cards and panels; `rounded-card` 14px.
- `shadow-card` (resting), `shadow-pop` (menus, dialogs, signed-out cards),
  `shadow-glow` (interactive card hover).
- `animate-rise` for things that appear; all motion is off under
  `prefers-reduced-motion`.

---

## Components (`components/ui`)

| Component | Notes |
|---|---|
| `Button` / `buttonClass()` | `primary` (mint pill), `light` (black pill; white on a black band), `secondary` (white outline pill), `ghost`, `danger`; `sm` `md` `lg`; `loading`. |
| `Card`, `CardContent`, `CardHeader`, `SectionHeading`, `IconBadge` | `interactive` for clickable cards, `elevated` for the one card a signed-out page is. |
| `Input`, `Textarea`, `Select`, `Label`, `FieldHint`, `FieldError` | `invalid` and `controlSize` (`sm`/`md`). |
| `Alert` | `danger` `warning` `info` `success`. |
| `Pill`, `PurposeBadge`, `StatusPill` | `dot` leads a status pill. |
| `Switch` | `role="switch"`. |
| `Skeleton`, `LoadingBlock`, `EmptyState`, `ErrorState` | Every screen resolves to loading, empty, error or content. |

### Rules

- Never override a base utility with another of the same property; use the component's
  prop (`size`, `controlSize`, `elevated`) or set the value on a parent.
- Option controls are cards over visually hidden native inputs; focus shows through
  `has-[:focus-visible]` in the `focus` blue.
- Tables become stacked cards below `md`. Sticky action bars sit at `bottom-16`
  below `md`, clear of the tab bar.
