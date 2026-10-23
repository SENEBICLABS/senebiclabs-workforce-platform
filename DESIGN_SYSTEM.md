# Senebiclabs Design System

One system for the public site, the clinician app and the operator console.
Dark ground, teal in the edges and accents, hierarchy by type and a
teal-tinted text ramp rather than grey.

The source of truth is the `@theme` block in `app/globals.css`. Everything
below is a utility class generated from it. `lib/design.ts` mirrors the values
for the rare place that needs a JS colour (chart fills, inline SVG).

---

## Tokens

### Surfaces

| Token | Value | Use |
|---|---|---|
| `canvas` | `#000000` | The page |
| `canvas-top` | `#070909` | Inputs, table heads, recessed panels |
| `surface` | `#0C0E0E` | Cards |
| `surface-raised` | `#141817` | Menus, dialogs, secondary buttons |
| `rail` | `#050707` | Sidebar |

### Text

| Token | Value | Contrast on `surface` | Use |
|---|---|---|---|
| `ink` | `#FFFFFF` | 19:1 | Headings, values, the answer |
| `strong` | `#E6F0ED` | 16:1 | Lead copy, labels |
| `muted` | `#A3BDB6` | 9.7:1 | Supporting copy, descriptions |
| `subtle` | `#739089` | 5.4:1 | Captions, timestamps, hints |
| `placeholder` | accent at 50% | — | Empty fields only |

The secondary steps are tinted with the accent, never grey.

### Edges

- `hairline`: the card edge (accent at 22%)
- `hairline-soft`: rows and dividers inside a card (12%)
- `hairline-strong`: controls you type into or press (38%)

### Accent and semantics

`accent` `#4FBFA4` · `accent-hover` `#6ADABD` · `accent-soft` `#0E2B26` ·
`on-fill` `#03211C` for text on a filled accent.
`success` / `info` / `warning` / `danger`, each with a `-soft` chip colour.
The colour is light and the chip is dark.

### Geometry, depth, motion

- `rounded-btn` 8px (buttons, inputs, option cards) · `rounded-card` 12px
- `shadow-card` (resting) · `shadow-pop` (menus, dialogs, signed-out cards) · `shadow-glow` (interactive card hover)
- `animate-rise`: a 220ms fade-and-lift for things that appear. `animate-pulse-soft` for skeletons. All motion is off under `prefers-reduced-motion`.

### Type

DM Sans for body, Geist for headings (applied to `h1`–`h6` by element), and Geist Mono for
eyebrows (`text-label`, uppercase). Scale: `text-title` 24, `text-section` 16,
`text-body` 16, `text-label` 11.5. Form labels are sans semibold, not mono.

---

## Components (`components/ui`)

| Component | Notes |
|---|---|
| `Button` / `buttonClass()` | `primary`, `secondary`, `ghost`, `danger`, `light` (public CTA); `sm` `md` `lg`; `loading`. Use `buttonClass` for links. |
| `Card`, `CardContent`, `CardHeader`, `SectionHeading`, `IconBadge` | `interactive` for clickable cards, `elevated` for the one card a signed-out page is. |
| `Input`, `Textarea`, `Select`, `Label`, `FieldHint`, `FieldError` | `invalid` and `controlSize` (`sm`/`md`). `Select` is native, with our chevron. |
| `Alert` | `danger` `warning` `info` `success`; the caller chooses `role`. |
| `Pill`, `PurposeBadge`, `StatusPill` | `dot` leads a status pill with its colour. |
| `Switch` | `role="switch"`. |
| `Skeleton`, `LoadingBlock`, `EmptyState`, `ErrorState` | Every screen resolves to loading, empty, error or content. |

Shells: `AppLayout` (sidebar, top bar, mobile tab bar, toast),
`AuthShell` and `OnboardingShell` with `Steps` (`components/auth/AuthShell.tsx`),
and the marketing layout (`SiteHeader`, `SiteFooter`, `Section`).

### Rules

- **Never override a base utility with another of the same property** (`h-9` over a size's
  `h-11`, `shadow-pop` over `shadow-card`, a second text colour). Tailwind does not
  guarantee which one wins. Use the component's prop (`size`, `controlSize`, `elevated`),
  or set the colour on a parent and let it inherit.
- Option controls (radios, checkboxes) are cards with the native input visually hidden
  inside, so keyboard and screen-reader behaviour is unchanged. Focus shows through
  `has-[:focus-visible]`.
- Tables become stacked cards below `md` instead of scrolling sideways (see `/queue`).
- Sticky action bars sit at `bottom-16` below `md` to clear the mobile tab bar.
