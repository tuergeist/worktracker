# worktracker — Golf Training

Eine kleine App, um Golf-Trainingsergebnisse zu tracken. Erstes Thema: **Putten**.

## Idee

Es gibt Übungen (default + später eigene), deren Ergebnisse über die Zeit
getrackt werden. Beispiel-Übung: *Putten aus 1m, 10 Bälle* — erfasst wird pro
Ball, wie viele Putts bis zum Einlochen gebraucht werden. Daraus ergibt sich die
Verteilung der 1-Putts, 2-Putts, 3-Putts … sowie die Gesamtzahl der Putts.

Default-Übungen: Putten 1m, 2m, 3m (je 10 Bälle). Eigene Übungen lassen sich
direkt in der App anlegen (Name, Distanz, Anzahl Bälle).

## Stack

- **Backend:** Python / FastAPI + SQLite (`backend/`)
- **Frontend:** Vanilla JS Single-Page-App (`frontend/`), ausgeliefert vom Backend

## Starten

```bash
pip install -r requirements.txt
uvicorn backend.app:app --reload
```

Dann http://127.0.0.1:8000 öffnen. Die SQLite-DB wird beim ersten Start unter
`backend/worktracker.db` angelegt und mit den Default-Übungen befüllt.

## API (Kurzüberblick)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/exercises` | Übungen auflisten |
| POST | `/api/exercises` | Übung anlegen |
| DELETE | `/api/exercises/{id}` | Übung löschen (nur eigene) |
| POST | `/api/sessions` | Session erfassen (`results`: Putts pro Ball) |
| GET | `/api/sessions?exercise_id=` | Sessions einer Übung |
| GET | `/api/exercises/{id}/stats` | Aggregierte Statistik & Verlauf |

Interaktive API-Doku unter `/docs`.
