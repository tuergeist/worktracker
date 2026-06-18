# Epics & Stories — Trend über Zeit

**Modul:** BMM · **Phase:** 3 Solutioning · **Autor:** Bob (Scrum Master, BMAD)
· **Quelle:** PRD.md, architecture.md

## Epic 1 — Trend über Zeit
Leistungsverlauf je Spieler als Liniendiagramm in Putten- und Range-Statistik.

### Story 1.1 — Wiederverwendbares SVG-Liniendiagramm + Putting-Trend
**Als** Spieler **möchte ich** in der Putt-Statistik meinen Putts-Verlauf als Linie sehen,
**damit** ich erkenne, ob ich mich verbessere.

Umfang:
- Neues Modul `frontend/js/chart.js` mit reiner Funktion `lineChart(points, opts)` (SVG-String).
- Putten-Ansicht zeigt Chart aus `stats.history` (Gesamt-Putts pro Session, chronologisch).
- Container in `index.html` + `.chart`-Styling.

Akzeptanzkriterien:
- AC1: `lineChart` liefert gültiges SVG für n≥2 Punkte; Punkte tragen `<title>` mit Datum+Wert.
- AC2: Bei <2 Sessions erscheint Hinweis statt Chart.
- AC3: Werte entsprechen der Verlaufsliste; keine Konsolenfehler.
- AC4: Keine neuen Abhängigkeiten.

### Story 1.2 — Range-Carry-Trend (Ø Carry pro Tag)
**Als** Spieler **möchte ich** je Schläger meinen Ø-Carry-Verlauf pro Tag sehen,
**damit** ich Distanz-Fortschritt und -Konstanz beurteilen kann.

Umfang:
- `backend/stats.py` → `club_stats()` um `carry_trend` (Tagesgruppierung, Ø Carry, aufsteigend).
- Range-Ansicht zeigt Chart aus `carry_trend` via `lineChart` (wiederverwendet aus 1.1).
- Container in `index.html` + Styling (wiederverwendet).

Akzeptanzkriterien:
- AC1: `carry_trend` gruppiert korrekt nach Tag, Ø stimmt, chronologisch aufsteigend.
- AC2: Chart rendert bei ≥2 Tagen; sonst Hinweis.
- AC3: Werte konsistent mit "Letzte Schläge"-Liste; keine Konsolenfehler.

## Reihenfolge
1.1 zuerst (liefert die Chart-Komponente), dann 1.2 (nutzt sie + Backend-Aggregation).
