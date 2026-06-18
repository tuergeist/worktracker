# Story 1.1 — SVG-Liniendiagramm + Putting-Trend

**Epic:** 1 Trend über Zeit · **Status:** geplant

## Kontext (für den Dev-Agenten)
Siehe docs/project-context.md. Frontend = vanilla ES-Module, relative Imports, geteilte
Helfer in `js/store.js`. Putt-Statistik wird in `js/putting.js → renderStats(stats, sessions)`
gerendert; `stats.history` ist bereits chronologisch (oldest→newest) mit `played_at` und
`total_putts`.

## Tasks
1. `frontend/js/chart.js` anlegen: `export function lineChart(points, opts)` → SVG-String.
   - responsiver viewBox, Linienzug, Punkte mit `<title>` (Datum + Wert), Min/Max-Label.
   - y-Skala min..max mit Padding; konstante Werte → flache Linie (keine Division durch 0).
2. `frontend/index.html`: `<div id="putt-chart" class="chart"></div>` in `#stats-panel`
   (zwischen Kennzahlen und `<h3>Verlauf</h3>`).
3. `frontend/js/putting.js`: in `renderStats` Punkte aus `stats.history` bauen
   (`label = Datum`, `value = total_putts`) und `#putt-chart` füllen; <2 Punkte → Hinweis.
4. `frontend/styles.css`: `.chart` Styling (Theme-Variablen).

## Akzeptanzkriterien
- AC1: SVG valide für n≥2; Punkte mit Hover-Title.
- AC2: <2 Sessions → Hinweis statt Chart.
- AC3: Werte == Verlaufsliste; keine Konsolenfehler.
- AC4: Keine neuen Abhängigkeiten.
