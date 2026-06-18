# PRD — Trend über Zeit

**Modul:** BMM · **Phase:** 2 Planung · **Autor:** John (PM, BMAD) · **Status:** Entwurf
· **Quelle:** product-brief.md

## 1. Überblick
Visualisierung des Leistungsverlaufs als Liniendiagramm in den bestehenden Statistik-Panels
für **Putten** und **Range**, jeweils gefiltert nach aktuell gewähltem Spieler.

## 2. Ziele
- G1: Spieler erkennt seinen Trend (Verbesserung/Verschlechterung) auf einen Blick.
- G2: Wiederverwendbare Chart-Komponente für künftige Diagramme.
- G3: Zero-Dependency beibehalten (Inline-SVG, kein Build-Step).

## 3. Nutzer & Kontext
Eingeloggter Profil-Spieler (kein Auth). Daten sind pro Spieler getrennt (siehe
docs/project-context.md → "catalogues shared, recorded data per-user").

## 4. Funktionale Anforderungen
- **FR1** — Putten: In `#stats-panel` wird unter den Kennzahlen ein Liniendiagramm der
  **Gesamt-Putts pro Session** über die Zeit (chronologisch, älteste links) angezeigt.
- **FR2** — Range: In `#club-stats-panel` wird ein Liniendiagramm des **Ø Carry pro Tag**
  über die Zeit angezeigt.
- **FR3** — Charts erscheinen nur bei **≥2 Datenpunkten**; bei <2 erscheint ein dezenter
  Hinweis ("Mehr Daten für einen Trend nötig").
- **FR4** — Beim Wechsel des Spielers/der Übung/des Schlägers aktualisiert sich der Chart
  konsistent mit den übrigen Kennzahlen.
- **FR5** — Datenpunkte zeigen beim Überfahren (hover/title) Datum + Wert.

## 5. Nicht-funktionale Anforderungen
- **NFR1** — Keine neuen npm/pip-Laufzeitabhängigkeiten.
- **NFR2** — Chart als reine Funktion (Daten → SVG-String), framework-frei, testbar im Kopf.
- **NFR3** — Konsistent mit bestehendem Grün-Theme (CSS-Variablen).
- **NFR4** — Aggregationslogik bleibt serverseitig in `backend/stats.py` (pure functions).

## 6. Akzeptanzkriterien (übergreifend)
- AC1: Mit ≥2 Sessions/Tagen rendert je Ansicht ein SVG-Linienzug ohne Konsolenfehler.
- AC2: Werte stimmen mit der darunterliegenden Verlaufsliste überein.
- AC3: Mit 0–1 Datenpunkt erscheint statt Chart der Hinweis.
- AC4: `uvicorn backend.app:app` startet unverändert; keine neuen Imports außerhalb stdlib/FastAPI.

## 7. Offene Punkte
- Putt-Metrik: Gesamt-Putts gewählt (klar interpretierbar). 1-Putt-Quote als zweite Linie ist
  späteres Increment.
