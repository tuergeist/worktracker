# Architektur — Trend über Zeit

**Modul:** BMM · **Phase:** 3 Solutioning · **Autor:** Winston (Architect, BMAD)
· **Quelle:** PRD.md, docs/project-context.md

## Leitentscheidung
Zero-Dependency beibehalten: Diagramme als **Inline-SVG**, gerendert von einer reinen
JS-Funktion. Kein Chart-Framework, kein Build-Step.

## Komponenten & Änderungen

### Frontend
- **NEU `frontend/js/chart.js`** — exportiert `lineChart(points, opts)`:
  - `points`: `[{ label: string, value: number }]` (chronologisch, älteste zuerst).
  - liefert einen SVG-String (viewBox-basiert, responsiv) mit Achsen-Baseline, Linienzug,
    Punkten (`<circle><title>` für Hover = Datum + Wert) und Min/Max-Beschriftung.
  - rein, ohne DOM-Seiteneffekte → leicht nachvollziehbar/testbar.
- **`frontend/js/putting.js`** — in `renderStats()` Chart aus `stats.history`
  (`played_at` → label, `total_putts` → value) ergänzen; <2 Punkte → Hinweistext.
- **`frontend/js/range.js`** — in `renderStats()` Chart aus neuem `stats.carry_trend`
  (`date` → label, `avg_carry` → value); <2 Punkte → Hinweistext.
- **`frontend/index.html`** — je ein `<div class="chart">` Container in `#stats-panel`
  und `#club-stats-panel`.
- **`frontend/styles.css`** — `.chart` Styling im bestehenden Theme.

### Backend
- **`backend/stats.py`** — `club_stats()` um `carry_trend` erweitern: Schläge nach
  Kalendertag (`played_at[:10]`) gruppieren, Ø Carry je Tag, **chronologisch aufsteigend**.
  Reine Funktion, keine DB.
- **Putten:** keine Backend-Änderung nötig — `aggregate_stats().history` liefert bereits
  `played_at` + `total_putts` in chronologischer Reihenfolge (oldest→newest).
- Kein neuer Endpoint: Daten reisen über die bestehenden `…/stats`-Endpoints mit.

## Datenfluss
1. View wählt Übung/Schläger → `GET /api/exercises/{id}/stats?user_id=` bzw.
   `GET /api/clubs/{id}/stats?user_id=`.
2. Antwort enthält `history` (Putten) bzw. `carry_trend` (Range).
3. View mappt auf `points` und ruft `lineChart(points)` → setzt `innerHTML` des Containers.

## Konsistenz / Risiken
- Zeitachse: Backend liefert aufsteigend sortiert; Frontend sortiert nicht erneut.
- Zeitzonen: `played_at` ist UTC-naiv; Tages-Gruppierung nutzt das gespeicherte Datum
  (UTC) — für Trend ausreichend, dokumentiert als bekannte Vereinfachung.
- Achsen-Skalierung: y von min..max der Werte mit kleinem Padding; Division-durch-0 bei
  konstanten Werten abfangen (flache Linie in Boxmitte).

## Teststrategie
- Backend: `carry_trend` manuell via curl prüfen (Gruppierung/Ø korrekt, aufsteigend).
- Frontend: visuell + Konsolen-Fehlerfreiheit; <2-Punkte-Fall prüfen.
