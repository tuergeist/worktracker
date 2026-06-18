---
project_name: 'worktracker — Golf Training'
date: '2026-06-18'
sections_completed: ['technology_stack', 'implementation_rules', 'data_model', 'conventions', 'gotchas']
generated_by: 'BMAD bmad-generate-project-context'
---

# Project Context for AI Agents

_Critical rules and patterns AI agents must follow when implementing code here.
Focus is on unobvious details, not generic advice._

## Overview

Golf training tracker. Two topics so far: **Putten** (putting) and **Range**.
Backend = FastAPI + stdlib SQLite; frontend = dependency-free vanilla-JS ES modules
served by the backend. No build step. UI and user-facing docs are in **German**.

## Technology Stack & Versions

- **Python** 3.11 — backend
- **FastAPI** ≥0.115 (tested on 0.137), **uvicorn** ≥0.30
- **Pydantic v2** (ships with FastAPI) — request schemas; use `model_dump(exclude_unset=True)` for PATCH
- **SQLite** via stdlib `sqlite3` — **no ORM**, raw SQL with `sqlite3.Row`
- **Frontend**: plain JavaScript **ES modules** (`<script type="module">`), no framework, no bundler, no TypeScript
- Run: `uvicorn backend.app:app --reload` → serves API + frontend on one port

## Project Structure

```
backend/
  app.py      # FastAPI app + all routes; StaticFiles mounted LAST at "/"
  db.py       # SQLite schema, get_conn(), init_db(), _migrate(), seed_defaults()
  models.py   # Pydantic request schemas
  stats.py    # PURE functions: session_stats, aggregate_stats, club_stats
frontend/
  index.html  # single page, topic tabs
  styles.css
  js/
    store.js   # shared: api client, global `store` (users/currentUserId), user-change pub/sub, DOM helpers
    users.js   # player selector
    putting.js # putting view
    range.js   # range view
    main.js    # tab switching + init order
```

## Critical Implementation Rules

### Backend
- **Add API routes BEFORE the `app.mount("/", StaticFiles(...))` line** in `app.py`. The catch-all static mount is last; routes added after it are shadowed.
- All API paths are under `/api`. Return shapes are built by `_*_dict()` helpers in `app.py` — extend those, don't hand-roll dicts at call sites.
- **No ORM.** Use `with db.get_conn() as conn:` and parameterised SQL. Each connection sets `PRAGMA foreign_keys = ON` (in `get_conn`); rely on `ON DELETE CASCADE`.
- **Stats logic lives in `stats.py` as pure functions** (input lists/dicts → dict). Keep it free of DB/HTTP so it stays testable. Don't compute aggregates inline in routes.
- Schema changes go in `db.py`: add to `SCHEMA` (uses `CREATE TABLE IF NOT EXISTS`) AND add a guard in `_migrate()` for existing DBs (`PRAGMA table_info` check + `ALTER TABLE`). SQLite can't add a `NOT NULL` column without default — add nullable then backfill in `seed_defaults()`.
- `seed_defaults()` must stay **idempotent** (guarded by `COUNT(*) WHERE is_default=1` etc.).
- Validation: use Pydantic `Field` constraints; raise `HTTPException` for business rules (e.g. "last user cannot be deleted", "carry ≥ 0").

### Data model (current)
- `users` — lightweight profiles, **no auth**. At least one user always exists; deleting the last is blocked.
- `exercises` — **shared** putting catalogue; `is_default=1` rows are seeded and not deletable from the UI (editable yes).
- `sessions` — per **user**, FK to exercise. `results_json` = JSON array of putts-per-ball.
- `clubs` — **shared** range catalogue; `abbr`, `sort_order`, `is_default`. Seeded Driver…SW incl. 7i.
- `shots` — per **user**, FK to club. `carry_m` REAL, `drift_m` REAL **signed: negative = left, positive = right**, `tags_json` = JSON array.
- Rule: **catalogues (exercises, clubs) are shared across users; recorded data (sessions, shots) is per-user.** Stats endpoints always take `user_id`.

### Frontend
- ES modules with **relative imports** (`./store.js`). Shared state and the API client live in `store.js`; import from there, don't duplicate.
- Player changes broadcast via `store.js` pub/sub: views call `onUserChange(fn)` in their `init`; `setUser` calls `notifyUserChange()`. New per-user views must subscribe to refresh.
- Current player id is persisted in `localStorage` (`wt.currentUserId`).
- Always escape user-supplied strings with `escapeHtml()` before inserting into `innerHTML`.
- A new "topic" = new tab button in `index.html` (`data-tab`), a `#view-<name>` container, and an `init<Name>()` module wired in `main.js`.
- `drift_m` UI convention: direction select (`links`=-1 / `gerade`=0 / `rechts`=+1) × distance; reconstruct sign on save, decode on display.

## Conventions
- **Language**: all user-facing UI text and product docs in **German**. Code identifiers and comments in English.
- Python: snake_case, type hints. JS: camelCase, `"use strict"`.
- Distances: putting stored as `distance_cm` (int); range as `carry_m`/`drift_m` (REAL meters).
- Timestamps stored UTC-naive by SQLite `datetime('now')`; frontend appends `"Z"` before `new Date(...)`.

## Gotchas / Don't-miss
- `backend/worktracker.db` and `*.db` are **gitignored** — never commit the DB. It is recreated and re-seeded on first run.
- When testing locally, the DB persists between runs; delete it to re-trigger seeding/migrations.
- There are **no automated tests yet**; verification is done by running uvicorn and curling `/api/...`. New backend logic should be added in a way that keeps `stats.py` unit-testable.
- Git: work is committed to `master` per the user's instruction. Keep commits focused; user-facing summaries in German.
