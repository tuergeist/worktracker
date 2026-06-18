# Sprint Status — Trend über Zeit

**Modul:** BMM · **Phase:** 4 Implementation · **Quelle:** epics-and-stories.md

| Story | Titel | Status |
|------|-------|--------|
| 1.1 | SVG-Liniendiagramm + Putting-Trend | ✅ fertig |
| 1.2 | Range-Carry-Trend (Ø Carry/Tag) | ✅ fertig |

Reihenfolge: 1.1 → 1.2. Implementierungsagent: Amelia (Dev). Review: bmad-code-review.

## Review-Notiz
Code-Review-Befund behoben: `preserveAspectRatio="none"` entfernt, damit die
Datenpunkte auf breiten Bildschirmen nicht zu Ovalen verzerrt werden (Seitenverhältnis
bleibt erhalten). Verifiziert: `carry_trend`-Gruppierung korrekt (145/135/155, aufsteigend),
Putt-Verlauf chronologisch, `lineChart` liefert valides SVG inkl. Flat-Line-/Einzelpunkt-Fall.
