# EXPERIENCE.md — Golf Training PWA
**Status:** Draft
**App:** Golf Training ⛳ (Putten + Range)
**UI Language:** German
**Last updated:** 2026-06-18

---

## 1. Foundation

### Purpose
A pocket utility for golfers logging training at the putting green and driving range. The app reduces cognitive overhead mid-session so players can record a result in seconds and return focus to the game.

### Design Philosophy
**One task per screen.** The recording view is the primary surface; everything else is secondary navigation. The app never shows two workflows at the same time.

**Fast exit.** Every primary action must be completable one-handed, in bright sunlight, without reading labels — aiming for under 15 seconds from pocket to saved.

**No waste.** No unnecessary confirmations, no decorative chrome, no text where a large tap target does the same job.

### Constraints
- Outdoor use, direct sunlight — contrast must exceed WCAG AA at all times
- One-handed operation — all primary targets on lower 60% of screen
- No authentication — lightweight profile switching only
- PWA — works offline, installable on Pixel 8 (Android/Chrome) and iPhone 13+ (iOS/Safari)
- German UI throughout

---

## 2. Information Architecture

### Global Shell
```
┌──────────────────────────────────┐
│  [Spieler-Avatar ▾]   ⛳ Golf    │  ← Header (compact, sticky)
├──────────────────────────────────┤
│                                  │
│         Tab Content Area         │
│                                  │
│                                  │
├──────────────────────────────────┤
│  [ Putten ]      [ Range ]       │  ← Bottom Tab Bar
└──────────────────────────────────┘
```

**Header** — player picker only. No navigation, no app menu. Tap the avatar/name to open a bottom sheet listing profiles.

**Bottom Tab Bar** — two tabs. Active tab shows filled icon + label. Inactive tab shows outlined icon only (saves space, reduces clutter).

### Tab: Putten
```
Top strip:   [ Übung wählen ▾ ]              (compact picker)
─────────────────────────────────────────────
Primary:     Recording view                  (counter grid — full screen)
─────────────────────────────────────────────
Footer:      [ Speichern ]   [ Statistik → ]
```

### Tab: Range
```
Top strip:   [ Club wählen ▾ ]               (compact picker, shows club icon)
─────────────────────────────────────────────
Primary:     Recording view                  (large number input or batch counters)
─────────────────────────────────────────────
Footer:      [ Speichern ]   [ Statistik → ]
```

### Stats Screen (secondary, per tab)
Accessed via "Statistik →" footer link. Full-screen modal or pushed route — never the default view. Contains session history, aggregates, and trend charts. Back arrow returns to recording view.

### Screen Inventory
| Screen | Type | Default? |
|---|---|---|
| Putten – Aufnahme | Tab primary | Yes |
| Putten – Statistik | Secondary (pushed) | No |
| Range – Aufnahme | Tab primary | Yes |
| Range – Statistik | Secondary (pushed) | No |
| Spieler wählen | Bottom sheet | No |
| Übung wählen | Bottom sheet | No |
| Club wählen | Bottom sheet | No |

---

## 3. Voice and Tone

| Context | Tone | Example |
|---|---|---|
| Labels | Ultra-short, noun-only | "1-Putt", "Weite (m)", "Driver" |
| Actions | Imperative verb | "Speichern", "Zurücksetzen" |
| Empty states | Friendly, brief | "Noch keine Einträge." |
| Errors | Direct, no blame | "Anzahl stimmt nicht überein." |
| Confirmations | None for saves — no toast, no modal | — |

No punctuation in labels. No ellipsis on buttons. No filler copy ("Bitte wählen Sie…").

---

## 4. Component Patterns

### 4.1 Bottom Tab Bar
- Height: `{spacing.tabBar.height}` (minimum 56dp/px safe-area-aware)
- Background: `{color.surface.default}`
- Active icon + label color: `{color.accent.primary}`
- Inactive icon color: `{color.content.tertiary}`
- Font: `{typography.label.sm}`, weight medium
- Tab tap target: full-width divided by 2 — no gaps between hit areas
- Active indicator: filled bottom border `{color.accent.primary}`, 3px

### 4.2 Compact Picker Strip (top of each tab)
Appears above the recording area. Single line, full width.

- Height: `{spacing.pickerStrip.height}` (~48dp)
- Background: `{color.surface.raised}`
- Shows current selection: icon + short label + chevron-down
- Tap opens a **Bottom Sheet Picker** (see 4.3)
- Token: `{component.pickerStrip}`

### 4.3 Bottom Sheet Picker
Triggered by compact picker strip or player header tap.

- Max height: 60vh — scrollable list beyond that
- Handle bar at top: `{color.content.tertiary}`, 4×32dp rounded
- List items: `{spacing.listItem.height}` (~56dp), icon left, label, checkmark on active
- Background: `{color.surface.overlay}`
- Dismiss: swipe down or tap outside
- Token: `{component.bottomSheet}`

### 4.4 Counter Cell (Putten recording grid)
Four cells arranged in a 2×2 grid, each representing a putt-count bucket.

```
┌─────────────┐  ┌─────────────┐
│      1      │  │      2      │
│   1-Putt    │  │  2-Putts    │
│  count: 3   │  │  count: 5   │
└─────────────┘  └─────────────┘
┌─────────────┐  ┌─────────────┐
│      3      │  │      4+     │
│  3-Putts    │  │  4+-Putts   │
│  count: 1   │  │  count: 1   │
└─────────────┘  └─────────────┘
```

- Minimum tap area per cell: 100×100dp
- Count displayed: `{typography.display.lg}`, `{color.content.primary}`
- Label: `{typography.label.sm}`, `{color.content.secondary}`
- Active cell (last tapped): background `{color.accent.subtle}`, border `{color.accent.primary}`
- Increment: single tap anywhere in cell
- Decrement: long-press (≥500ms) with subtle haptic
- Cell background: `{color.surface.card}`
- Border radius: `{radius.card}`
- Total ball count shown below grid: "Gesamt: {n} / {num_balls}"
- Mismatch state (total ≠ num_balls): total label turns `{color.status.warning}`, Speichern button disabled
- Token: `{component.counterCell}`

### 4.5 Large Number Input (Range per-shot entry)
Single large numeric input occupying the visual center.

- Input display height: ~120dp — shows current value in `{typography.display.xl}`
- Below input: unit label "m" in `{typography.label.md}`, `{color.content.secondary}`
- Keyboard type: numeric, no decimals, opens automatically on screen focus
- Clear button (×): appears when value > 0, top-right of input field
- No stepper buttons — keyboard is the only input method
- Background: `{color.surface.default}`
- Token: `{component.largeNumberInput}`

### 4.6 Primary Action Button (Speichern)
Full-width, placed in footer above bottom tab bar.

- Height: `{spacing.button.lg}` (~56dp)
- Background: `{color.accent.primary}`
- Label: "Speichern", `{typography.label.lg}`, `{color.content.onAccent}`
- Disabled state: `{color.accent.primary}` at 40% opacity, non-interactive
- On tap: immediate save, no confirmation; brief haptic feedback
- After save: counters reset to zero (Putten) or input clears (Range) — ready for next entry
- Token: `{component.buttonPrimary}`

### 4.7 Secondary Action Link (Statistik →)
Inline text link next to or below the primary button.

- Style: `{typography.label.md}`, `{color.accent.primary}`, underline on focus
- Tap pushes Statistik screen
- Token: `{component.linkSecondary}`

### 4.8 Player Header Chip
Left-aligned in header. Compact.

- Shows: avatar initial (single letter) or photo thumbnail + player name truncated to 12 chars + chevron-down
- Avatar size: 28×28dp, `{radius.full}`, background `{color.accent.subtle}`, text `{color.accent.primary}`
- Font: `{typography.label.sm}`, weight medium
- Tap opens player picker bottom sheet
- Token: `{component.playerChip}`

---

## 5. State Patterns

### 5.1 Putten Tab States
| State | Condition | Behavior |
|---|---|---|
| Empty | No übung selected | Übung picker highlighted, counter grid dimmed, Speichern disabled |
| Recording | Übung selected, counters being tapped | Counter cells active, total updates live |
| Mismatch | Gesamt ≠ num_balls | Total label in `{color.status.warning}`, Speichern disabled |
| Ready | Gesamt = num_balls | Speichern enabled |
| Saved | After Speichern tap | Counters reset, brief success haptic, stay on recording screen |

### 5.2 Range Tab States
| State | Condition | Behavior |
|---|---|---|
| Empty | No club selected | Club picker highlighted, input dimmed, Speichern disabled |
| Input | Club selected, value empty or 0 | Keyboard open, Speichern disabled |
| Ready | Club selected, value > 0 | Speichern enabled |
| Saved | After Speichern tap | Input clears, keyboard re-focuses for next shot, brief haptic |

### 5.3 Offline State
No explicit UI change for normal operation (data is stored locally first). If sync is attempted and fails: passive indicator in header only — no blocking modals.

### 5.4 First Launch / No Profiles
Show player creation prompt as a bottom sheet on first open. Single text field "Name". Confirm creates profile and dismisses. No skip option.

---

## 6. Interaction Primitives

### 6.1 Tap
Standard activation. All primary targets ≥ 44×44dp (iOS HIG minimum). Prefer 56–100dp for outdoor use.

### 6.2 Long Press
Used exclusively for counter cell decrement (≥500ms). No other long-press interactions.

### 6.3 Swipe Down
Dismiss bottom sheets. No swipe navigation between tabs (use tab bar only — avoids accidental swipes while gripping phone).

### 6.4 Haptics
| Event | Pattern |
|---|---|
| Counter increment | Light impact |
| Counter decrement (long press) | Medium impact |
| Save success | Success notification |
| Validation error (mismatch) | Warning notification |

Haptics use native device APIs (Android Vibrate / iOS UIImpactFeedbackGenerator) via PWA Web Vibration API where available. Silent fallback where not.

### 6.5 Keyboard Behavior (Range)
- Numeric keyboard opens automatically when Range tab is active and a club is selected
- Keyboard does not close after save — player is assumed to enter next shot immediately
- "Done" / "Return" on keyboard triggers Speichern if value > 0

### 6.6 Scroll
- Tab content area: no scroll in recording view — everything fits on one screen
- Stats screen: vertical scroll, no horizontal scroll
- Bottom sheet lists: vertical scroll within sheet, sheet itself does not scroll page behind it

---

## 7. Accessibility Floor

The following is the minimum required — not aspirational. Ship nothing that fails these.

### 7.1 Contrast
- All text on backgrounds: minimum 4.5:1 (WCAG AA)
- Counter cell large numerals: minimum 3:1 (WCAG AA large text)
- Accent color `{color.accent.primary}` must meet 4.5:1 against `{color.surface.default}`
- Disabled states exempted from contrast requirement per WCAG 1.4.3

### 7.2 Touch Target Size
- Primary actions (Speichern, counter cells): minimum 56×56dp
- Secondary actions (Statistik link): minimum 44×44dp
- No interactive element smaller than 44×44dp regardless of visual size

### 7.3 Focus and Screen Reader
- All interactive elements have an `aria-label` in German
- Counter cells: `aria-label="1-Putt, {n} mal"`, `role="button"`
- Bottom sheet: `role="dialog"`, `aria-modal="true"`, focus trapped while open
- Tab bar: `role="tablist"`, each tab `role="tab"`, `aria-selected`
- Large number input: `aria-label="Weite in Metern"`, `inputmode="numeric"`

### 7.4 Motion
No animations that flash more than 3 times per second. Counter increment: instant, no animation. Sheet open/close: 200ms ease-out — respects `prefers-reduced-motion` (instant if set).

### 7.5 Color Independence
State is never conveyed by color alone. Mismatch state uses warning label text in addition to color change. Disabled button uses both opacity and non-interactivity.

---

## 8. Key Flows

### Flow 1 — Putten: Batch Entry After 10 Putts
**Actor:** Markus (45, golfer), standing at putting green, phone in one hand
**Goal:** Log 10 putts (e.g. 4×1-Putt, 4×2-Putts, 1×3-Putts, 1×4+-Putts) in under 15 seconds

1. Pull phone from pocket → app is already on Putten tab (last used state persists)
2. If übung not selected: tap "Übung wählen" strip → bottom sheet opens → tap correct übung → sheet closes (2–3 seconds)
3. Tap "1-Putt" cell 4 times → counter shows 4
4. Tap "2-Putts" cell 4 times → counter shows 4
5. Tap "3-Putts" cell 1 time → counter shows 1
6. Tap "4+-Putts" cell 1 time → counter shows 1
7. "Gesamt: 10 / 10" — match, Speichern enabled
8. Tap "Speichern" → haptic success, counters reset to 0
9. Phone back in pocket

**Timing target:** Steps 3–8 under 10 seconds. Full flow (including übung selection) under 15 seconds.

**Error path:** Mis-tap a counter → long-press cell to decrement → tap Speichern when total matches.

**Component tokens involved:** `{component.pickerStrip}`, `{component.bottomSheet}`, `{component.counterCell}`, `{component.buttonPrimary}`

---

### Flow 2 — Range: Per-Shot Carry Entry
**Actor:** Markus at driving range between shots with Driver
**Goal:** Log carry distance for one shot immediately after hitting

1. Switch to Range tab (bottom tab bar)
2. If club not selected: tap "Club wählen" strip → bottom sheet → tap "Driver" → sheet closes
3. Numeric keyboard is open, input focused
4. Type "182" → large display shows "182 m"
5. Tap "Speichern" (or tap "Done" on keyboard) → haptic, field clears, keyboard stays open
6. Ready for next shot

**Timing target:** Steps 3–5 under 5 seconds once club is selected.

**Error path:** Type wrong value → tap × to clear → re-enter.

**Component tokens involved:** `{component.pickerStrip}`, `{component.bottomSheet}`, `{component.largeNumberInput}`, `{component.buttonPrimary}`

---

### Flow 3 — Player Switch
**Actor:** Two players sharing one device
**Goal:** Switch active player before starting a session

1. Tap player chip in header
2. Bottom sheet opens, lists all profiles with checkmark on active
3. Tap different player → checkmark moves, sheet closes
4. Header now shows new player name

**No auth, no password, no confirmation required.**

**Component tokens involved:** `{component.playerChip}`, `{component.bottomSheet}`

---

## Appendix: Token Reference Stubs

The following `{token.path}` references in this document require definition in DESIGN.md:

**Colors**
- `{color.surface.default}` — main page background
- `{color.surface.raised}` — picker strip, slightly elevated
- `{color.surface.card}` — counter cell background
- `{color.surface.overlay}` — bottom sheet background
- `{color.accent.primary}` — brand green (golf-appropriate), interactive elements
- `{color.accent.subtle}` — tinted cell active state
- `{color.content.primary}` — primary text
- `{color.content.secondary}` — supporting text
- `{color.content.tertiary}` — inactive icons, sheet handle
- `{color.content.onAccent}` — text on accent-colored surfaces
- `{color.status.warning}` — mismatch indicator

**Typography**
- `{typography.display.xl}` — large number input value
- `{typography.display.lg}` — counter cell count
- `{typography.label.lg}` — primary button label
- `{typography.label.md}` — unit label, secondary links
- `{typography.label.sm}` — tab bar labels, cell sub-labels, header chip

**Spacing**
- `{spacing.tabBar.height}` — bottom tab bar height
- `{spacing.pickerStrip.height}` — exercise/club picker strip height
- `{spacing.button.lg}` — primary button height
- `{spacing.listItem.height}` — bottom sheet list item height

**Radius**
- `{radius.card}` — counter cell corner radius
- `{radius.full}` — avatar circle

**Components**
- `{component.counterCell}` — putten counter cell spec
- `{component.largeNumberInput}` — range distance input spec
- `{component.buttonPrimary}` — primary action button spec
- `{component.linkSecondary}` — stats navigation link spec
- `{component.pickerStrip}` — compact exercise/club picker strip spec
- `{component.bottomSheet}` — modal bottom sheet spec
- `{component.playerChip}` — header player selector chip spec
