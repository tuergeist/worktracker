# Story 1.2 — Range-Carry-Trend (Ø Carry pro Tag)

**Epic:** 1 Trend über Zeit · **Status:** geplant · **abhängig von:** 1.1 (chart.js)

## Kontext (für den Dev-Agenten)
Aggregation gehört in `backend/stats.py` (pure functions). `club_stats(shots)` bekommt die
Schläge newest-first; jeder Shot hat `carry_m` und `played_at` ("YYYY-MM-DD HH:MM:SS", UTC-naiv).
Range-Statistik wird in `js/range.js → renderStats(stats)` gerendert.

## Tasks
1. `backend/stats.py`: in `club_stats` Feld `carry_trend` ergänzen — Schläge nach Tag
   (`played_at[:10]`) gruppieren, `avg_carry` je Tag (1 Nachkommastelle), Liste **aufsteigend**
   nach Datum: `[{ "date": "YYYY-MM-DD", "avg_carry": float, "shots": int }]`. Leerfall → `[]`.
2. `frontend/index.html`: `<div id="club-chart" class="chart"></div>` in `#club-stats-panel`
   (nach den Kennzahlen/Tag-Counts, vor `<h3>Letzte Schläge</h3>`).
3. `frontend/js/range.js`: in `renderStats` Punkte aus `stats.carry_trend`
   (`label = date`, `value = avg_carry`) bauen und `#club-chart` via `lineChart` füllen;
   <2 Punkte → Hinweis. Import `lineChart` aus `./chart.js`.

## Akzeptanzkriterien
- AC1: `carry_trend` korrekt gruppiert/gemittelt, aufsteigend.
- AC2: Chart bei ≥2 Tagen; sonst Hinweis.
- AC3: Werte konsistent mit "Letzte Schläge"; keine Konsolenfehler.
