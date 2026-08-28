# scratchlab — Golf Training

Eine kleine App, um Golf-Trainingsergebnisse zu tracken: **Putten**, **Range**
und geführte **Trainingspläne**. Läuft unter https://scratchlab.app.

## Idee

Es gibt Übungen (default + später eigene), deren Ergebnisse über die Zeit
getrackt werden. Beispiel-Übung: *Putten aus 1m, 10 Bälle* — erfasst wird pro
Ball, wie viele Putts bis zum Einlochen gebraucht werden. Daraus ergibt sich die
Verteilung der 1-Putts, 2-Putts, 3-Putts … sowie die Gesamtzahl der Putts.

Default-Übungen: Putten 1m, 2m, 3m (je 10 Bälle). Eigene Übungen lassen sich
direkt in der App anlegen (Name, Distanz, Anzahl Bälle).

## Stack

- **Backend:** Python / FastAPI + PostgreSQL (`backend/`)
- **Frontend:** Vanilla JS Single-Page-App (`frontend/`), ausgeliefert vom Backend

## Starten

```bash
docker compose up --build
```

Dann http://127.0.0.1:8080 öffnen. Compose bringt Postgres mit, fährt die
Alembic-Migrationen und befüllt den Default-Katalog. `DEV_LOGIN=1` ist dort
gesetzt, es gibt also einen Login ohne Google.

Ohne Compose braucht der Prozess ein erreichbares Postgres in `DATABASE_URL` —
SQLite wird nicht unterstützt, der Treiber ist gar nicht installiert.

## API (Kurzüberblick)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/exercises` | Übungen auflisten |
| POST | `/api/exercises` | Übung anlegen |
| DELETE | `/api/exercises/{id}` | Übung löschen (nur eigene) |
| POST | `/api/sessions` | Session erfassen (`results`: Putts pro Ball) |
| GET | `/api/sessions?exercise_id=` | Sessions einer Übung |
| GET | `/api/exercises/{id}/stats` | Aggregierte Statistik & Verlauf |
| GET/POST | `/api/clubs` | Schläger verwalten |
| POST | `/api/shots` | Range-Schlag erfassen |
| GET | `/api/clubs/{id}/stats` | Range-Statistik je Schläger |
| GET/POST | `/api/plan-runs` | Durchläufe eines Trainingsplans |

Die drei `POST`-Endpunkte oben akzeptieren einen `Idempotency-Key`-Header: ein
Wiederholversuch mit demselben Schlüssel liefert den zuerst angelegten
Datensatz zurück (HTTP 200) statt einen zweiten anzulegen.

Interaktive API-Doku unter `/docs`.
