# Product Brief — Trend über Zeit

**Modul:** BMM · **Phase:** 1 Analyse · **Autor:** John (PM, BMAD) · **Datum:** 2026-06-18

## Problem
Die App speichert pro Spieler Putt-Sessions und Range-Schläge und zeigt Aggregat-Kennzahlen
(Ø, Bestwert) sowie eine Verlaufs-**Liste**. Eine Liste macht aber nicht sichtbar, **ob man
besser wird**. Spieler wollen ihren Fortschritt über Wochen auf einen Blick erkennen.

## Zielgruppe
Bestehende Nutzer (Golfer, die regelmäßig Putten und an der Range üben) — Einzelpersonen,
die ihre eigene Entwicklung verfolgen.

## Lösung (eine Zeile)
Ein kompaktes Verlaufs-Liniendiagramm in den bestehenden Statistik-Panels: Putten = Putts pro
Session über die Zeit; Range = Ø Carry pro Tag über die Zeit — je gewähltem Spieler.

## Wertversprechen
- Fortschritt/Trend statt Momentaufnahme → Motivation und Übungssteuerung.
- Nutzt bereits erfasste Daten; kein neuer Erfassungsaufwand.

## Abgrenzung (nicht in diesem Increment)
- Keine Spielervergleiche/Ranglisten.
- Keine externe Charting-Bibliothek (Zero-Dependency-Prinzip der App bleibt).
- Keine Zeitraum-Filter/Zoom (später möglich).

## Erfolgskriterien
- In Putten- und Range-Ansicht erscheint pro Spieler ein Trend-Chart, sobald ≥2 Datenpunkte
  vorliegen.
- Keine neuen Laufzeit-Abhängigkeiten; App startet weiterhin nur mit FastAPI/uvicorn.
