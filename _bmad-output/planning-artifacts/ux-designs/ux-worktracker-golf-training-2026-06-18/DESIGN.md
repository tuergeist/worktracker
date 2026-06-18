---
status: draft
app: Golf Training ⛳
version: "1.0"

tokens:
  colors:
    primary: "#2e7d32"           # Golf green — primary actions, active states
    primary-dark: "#1b5e20"      # Pressed states, nav active indicator
    primary-light: "#e8f5e9"     # Tinted backgrounds, selected chips
    surface: "#f4f6f4"           # App background
    card: "#ffffff"              # Card / panel surface
    divider: "#e2e6e2"           # Borders, separators
    text-primary: "#1c241c"      # Body text, labels
    text-muted: "#6b766b"        # Secondary labels, placeholders
    error: "#c62828"             # Validation errors
    on-primary: "#ffffff"        # Text / icons on primary-colored surfaces

  typography:
    font-family: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    scale:
      metric:   { size: "3rem",   weight: 700, line-height: 1.0 }   # Key numbers (Meter, Anzahl)
      heading1: { size: "1.5rem", weight: 700, line-height: 1.2 }
      heading2: { size: "1.25rem",weight: 600, line-height: 1.3 }
      body:     { size: "1rem",   weight: 400, line-height: 1.5 }
      label:    { size: "0.875rem",weight: 500, line-height: 1.4 }
      caption:  { size: "0.75rem", weight: 400, line-height: 1.4 }

  rounded:
    sm: "6px"
    md: "12px"
    lg: "16px"
    pill: "999px"

  spacing:
    base: "8px"
    scale: [0, 4, 8, 12, 16, 24, 32, 48, 64]   # indices 0–8

  components:
    touch-target-min: "48px"
    nav-bar-height: "64px"
    card-padding: "16px"
    section-gap: "16px"
    input-height: "52px"
---

# Golf Training — Design System

## Brand & Style

Golf Training is a utilitarian field tool, not a marketing surface.
Its primary users are golfers standing outdoors in direct sunlight, often holding a club in one hand and glancing briefly at their phone.
The visual language is therefore:

- **Purposeful and direct.** Large numbers, unambiguous labels, no decorative chrome.
- **Nature-grounded.** A single golf-green accent anchors identity; the rest of the palette is near-neutral.
- **Physical-context-aware.** Every interactive element is sized for a gloved thumb; spacing is generous to prevent mis-taps.
- **German-language throughout.** Label copy follows German conventions (capitalised nouns, formal Sie omitted in favour of direct imperatives).

The tone is functional — confirm an action fast, get back to the game.

---

## Colors

### Palette

| Token | Hex | Role |
|---|---|---|
| `primary` | `#2e7d32` | Buttons, active nav, focus rings, key accents |
| `primary-dark` | `#1b5e20` | Pressed/active state of primary |
| `primary-light` | `#e8f5e9` | Chip selected bg, subtle tinted panels |
| `surface` | `#f4f6f4` | Page / app background |
| `card` | `#ffffff` | Cards, input fields, bottom sheet |
| `divider` | `#e2e6e2` | Horizontal rules, list separators, borders |
| `text-primary` | `#1c241c` | All primary text |
| `text-muted` | `#6b766b` | Secondary labels, placeholder, timestamps |
| `error` | `#c62828` | Field errors, destructive actions |
| `on-primary` | `#ffffff` | Text and icons placed directly on `primary` |

### Contrast requirements

All `text-primary` on `surface` or `card` must pass WCAG AA (4.5 : 1 minimum).
`on-primary` on `primary` must pass WCAG AA — the chosen green (`#2e7d32`) delivers ≈ 5.1 : 1 against white.
Outdoor glare degrades perceived contrast; treat 4.5 : 1 as a floor, aim for 7 : 1 where space allows (e.g., metric numbers).

### No dark mode in v1

The app is exclusively used outdoors in daylight.
Dark mode would reduce readability against a bright sky.
Reserve dark theme design for a future version.

---

## Typography

Font family: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

Uses the device's native sans-serif for zero loading cost and familiar rendering on both Pixel and iPhone.

### Type scale

| Role | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `metric` | 3 rem | 700 | 1.0 | Carry in meters, putt count, primary KPI |
| `heading1` | 1.5 rem | 700 | 1.2 | Screen titles |
| `heading2` | 1.25 rem | 600 | 1.3 | Card section headers |
| `body` | 1 rem | 400 | 1.5 | Descriptions, list content |
| `label` | 0.875 rem | 500 | 1.4 | Form labels, button text, nav labels |
| `caption` | 0.75 rem | 400 | 1.4 | Timestamps, sub-labels, helper text |

### Rules

- Never go below `caption` (0.75 rem) anywhere in the UI.
- `metric` numerals use tabular figures (`font-variant-numeric: tabular-nums`) so columns align.
- Button labels use `label` weight 500, sentence case (not ALL CAPS).
- Do not use more than two type sizes within a single card.

---

## Layout & Spacing

### Grid

Single-column fluid layout on all supported viewports (360 dp–430 dp wide).
Horizontal page padding: `16px` on each side.
Max content width: `480px`, centred — ensures the design reads well on tablets used at the range.

### Spacing scale

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 px`

- `4px` — micro gaps (icon-to-label, badge padding)
- `8px` — tight internal component spacing
- `16px` — standard card padding, section gap
- `24px` — gap between stacked cards
- `32px` — top-of-screen breathing room
- `48px` — bottom safe-area offset, extra thumb-zone padding

### Bottom navigation bar

Height: `64px` + device safe-area inset (via `env(safe-area-inset-bottom)`).
Two tabs: **Putten** | **Range**.
Icons: 24 × 24 px, label below in `caption` style.
Active tab: icon + label in `primary`, indicator bar (3 px, `primary`) above icon.
Inactive tab: icon + label in `text-muted`.
Background: `card` (`#ffffff`) with a single 1 px `divider` border on top.

### Thumb zone

Primary actions (log putt, add range shot) live at the bottom of the scroll area, just above the nav bar.
Secondary actions (edit, filter, export) live in top-right corners or overflow menus — reachable but not in the hot zone.

---

## Elevation & Depth

The app uses minimal elevation — two levels are sufficient.

| Level | CSS | Usage |
|---|---|---|
| 0 — Flat | no shadow | Page background, dividers |
| 1 — Card | `box-shadow: 0 1px 3px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)` | Data cards, form panels |
| 2 — Floating | `box-shadow: 0 4px 12px rgba(0,0,0,0.14)` | Bottom sheets, modal dialogs, FAB |

Do not use `box-shadow` to fake borders — use `divider` colour instead.
Avoid heavy drop shadows; they wash out in sunlight and add visual noise.

---

## Shapes

| Token | Value | Usage |
|---|---|---|
| `sm` | 6 px | Chips, badges, small buttons |
| `md` | 12 px | Cards, input fields |
| `lg` | 16 px | Bottom sheet top corners, modal panels |
| `pill` | 999 px | Primary CTA button, toggle switches |

Cards use `md` (12 px) on all four corners.
The bottom navigation bar has no border-radius on its bottom edge (flush with device chrome).
Bottom sheets round only the top-left and top-right corners at `lg` (16 px).

---

## Components

### Primary Button

- Height: `52px` (minimum touch target met)
- Border-radius: `pill` (999 px)
- Background: `primary`; text: `on-primary`; font: `label` 500
- Pressed state: background `primary-dark`, scale `0.97`
- Disabled: opacity `0.4`, cursor `not-allowed`
- Full-width inside cards; never less than `160px` wide

### Secondary / Ghost Button

- Same height and radius as primary
- Border: `2px solid primary`; text: `primary`; background: transparent
- Pressed: background `primary-light`
- Used for: cancel, secondary action in a pair

### Input Field

- Height: `52px`, border-radius `md` (12 px)
- Border: `1.5px solid divider`; focused: `2px solid primary`
- Background: `card`
- Label above the field, `label` style, `text-primary`
- Helper / error text below, `caption` style

### Numeric Stepper

Used for putt count and repeat count.
- `−` and `+` buttons: `48 × 48px` minimum, circle shape, `primary` outlined
- Value display centred, `metric` style
- Accessible: `aria-label` with current value and field name

### Metric Display Card

The dominant element on Putten and Range screens.

```
┌────────────────────────────────┐
│  Schläge heute    (heading2)   │
│                                │
│       12          (metric)     │
│                                │
│  ⌀ Distanz: 142 m  (label)    │
└────────────────────────────────┘
```

- Padding: `card-padding` (16 px)
- Number: `metric` (3 rem, 700) in `text-primary`
- Subline: `label` in `text-muted`
- Border-radius: `md`
- Elevation: level 1

### Club Chip Selector

Horizontal scroll row of pills for club selection on Range screen.
- Chip height: `36px`, padding `0 12px`, border-radius `sm` (6 px)
- Unselected: border `1.5px solid divider`, text `text-muted`, bg `surface`
- Selected: bg `primary-light`, border `1.5px solid primary`, text `primary`
- Row has `-16px` side margins so chips reach the screen edge; `16px` left padding so first chip aligns with content

### Bottom Navigation Bar

(See Layout & Spacing — bottom navigation bar section above.)

### List Row

Used in session history and shot log.

- Height: min `56px`
- Left: icon or date badge
- Centre: primary label (`body`) + secondary label (`caption`, `text-muted`)
- Right: value or chevron
- Divider: `1px solid divider` between rows, no divider after last row

### Empty State

Centred vertically in the scroll area above the CTA.
- Illustration: simple SVG line icon (no colour fill, `text-muted` stroke)
- Heading: `heading2`
- Subtext: `body`, `text-muted`
- CTA: Primary Button directly below

---

## Do's and Don'ts

### Do

- **Do** use `metric` (3 rem bold) for any number that is the primary reason the user opened the screen — carry distance, putt count, round score.
- **Do** keep every tappable element at least `48 × 48 dp` — including destructive actions like delete.
- **Do** place the most frequent action (log a shot, confirm a putt) within the bottom 40 % of the screen.
- **Do** confirm destructive actions (delete session, clear round) with a bottom sheet confirmation, not a browser alert.
- **Do** test every screen in direct sunlight or with screen brightness at 100 % before shipping.
- **Do** support one-handed use: swipe-to-delete on list rows is acceptable as a shortcut, but a visible delete affordance must also exist.
- **Do** use the system font — it renders crisply on both AMOLED (Pixel) and LCD (iPhone) without a network round-trip.

### Don't

- **Don't** use colour alone to convey state — pair colour changes with a label, icon, or shape change.
- **Don't** place primary actions in the top half of the screen; the thumb can't reach them comfortably.
- **Don't** introduce a dark mode in v1 — the outdoor use case makes it unhelpful and it doubles QA surface.
- **Don't** use more than three type sizes in one screen view — metric, heading2, and body are sufficient for data screens.
- **Don't** add decorative gradients, illustrations, or animations beyond simple fade/slide transitions — they distract in a focused-task context.
- **Don't** put critical numeric data in `text-muted` colour — always use `text-primary` for numbers the user acts on.
- **Don't** truncate metric numbers with ellipsis — if a value overflows, reduce font size progressively rather than cut the content.
- **Don't** rely on hover states — this is a touch-only surface.
