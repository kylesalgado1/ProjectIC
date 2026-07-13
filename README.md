# IC

## Purpose

IC is an HTTP API that serves multi-tenant party-venue catalog data. For a company it
exposes each location's bookable packages (with per-location price and availability
overrides), currently active promotions (with per-location overrides and date-window
filtering), and rooms filtered by group size. All pricing, availability,
promo-activation, and room-fit rules are computed by a single pure resolution engine. A
per-location assistant endpoint (`POST /ask`) accepts a free-text question and returns
an answer built only from that same resolved per-location context. The answerer is a
deterministic, grounded assistant: it replies solely from the resolved facts (packages,
active promos, and room capacity) for the location and makes no LLM calls. Every question
and its returned answer are logged.

## Requirements

- Python 3.12+
- PostgreSQL 15+
- Python packages: `fastapi`, `uvicorn`, `pydantic`, `psycopg` (v3), `httpx` (used by the
  FastAPI test client)

Install into a virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn pydantic "psycopg[binary]" httpx
```

## Database (DATABASE_URL)

The repository layer reads a single PostgreSQL connection string from the `DATABASE_URL`
environment variable. There are no hardcoded credentials; set it in your shell:

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/ic"
```

Create the database first if it does not exist:

```bash
createdb ic
```

## Load schema and seed data

```bash
psql "$DATABASE_URL" -f schema.sql
psql "$DATABASE_URL" -f seed.sql
```

`schema.sql` drops and recreates every table. `seed.sql` loads the sample companies,
locations, size tiers, packages, promos, and rooms used by the tests and by the demo
flow. The San Francisco location (id `13`) ships with the Ultimate Combo package (id
`1003`) switched off for that location and the SUMMER promo (id `3001`) active.

## Run the server

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/ic"
uvicorn main:app --reload
```

The API resolves requests for `company_id` 1 by default.

## Run the frontend

The manager UI is a Vite + React app in `frontend/`. Install dependencies and start the
dev server (start the backend first):

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints. The dev server proxies `/locations` to
`http://localhost:8000`. The app calls the API with relative paths only; there is no
hardcoded backend URL.

## Endpoints

- `GET /locations` — locations for the company
- `GET /locations/{location_id}/packages` — resolved, available packages for a location
- `GET /locations/{location_id}/promos/active` — promotions active today for a location
- `GET /locations/{location_id}/rooms?group_size=N` — rooms that seat at least `N` guests
- `POST /locations/{location_id}/ask` — ask a free-text question about a location; request
  body `{"question": "..."}`, response `{"answer": "..."}`
- `PATCH /locations/{location_id}/packages/{package_id}/active` — set a package's
  per-location availability; request body `{"is_active": true}`, response
  `{"success": true}`
- `PATCH /locations/{location_id}/promos/{promo_id}/active` — set a promo's per-location
  availability; request body `{"is_active": true}`, response `{"success": true}`

An unknown location returns `404`, as does an unknown or cross-tenant package or promo on
the `PATCH` endpoints. A non-positive `group_size` returns `400`, and an empty or
whitespace-only `question` returns `400`.

## Demo script

The end-to-end demo shows per-location resolution and that the grounded assistant answers
only from the current resolved facts for the selected location.

1. **Start the backend and the frontend.** Load `schema.sql` and `seed.sql`, run
   `uvicorn main:app --reload`, then in another shell run
   `cd frontend && npm install && npm run dev` and open the printed URL.
2. **Select San Francisco.** Click **San Francisco — San Francisco** in the location list
   to open its dashboard.
3. **Show packages, promos, and rooms.** The dashboard lists San Francisco's available
   packages, its active promos (including **SUMMER**), and the rooms that fit the group
   size. Ultimate Combo is absent: it ships overridden off for this location.
4. **Ask "What party packages do you offer?"** Submit the question in **Ask IC**. The
   answer lists the available packages and does not mention Ultimate Combo.
5. **Toggle Ultimate Combo active.** Use the package's **Activate** button. Only the Party
   Packages panel reloads, and Ultimate Combo now appears.
6. **Ask again and show the answer changed.** Re-ask "What party packages do you offer?".
   The answer now includes Ultimate Combo, proving the assistant reads live resolved facts.
7. **Toggle Summer Promo off.** Use the SUMMER promo's **Deactivate** button. Only the
   Active Promos panel reloads, and SUMMER disappears.
8. **Ask "Is the summer promo running?"** Submit the question in **Ask IC**.
9. **Show the location-scoped answer changed.** The answer now reports that SUMMER is not
   active for San Francisco, while it stays active for other locations — the override is
   per location.

Equivalent API calls (`API=http://localhost:8000`):

```bash
curl "$API/locations/13/packages"
curl -X POST "$API/locations/13/ask" \
  -H 'Content-Type: application/json' \
  -d '{"question": "What party packages do you offer?"}'
curl -X PATCH "$API/locations/13/packages/1003/active" \
  -H 'Content-Type: application/json' -d '{"is_active": true}'
curl -X POST "$API/locations/13/ask" \
  -H 'Content-Type: application/json' \
  -d '{"question": "What party packages do you offer?"}'
curl -X PATCH "$API/locations/13/promos/3001/active" \
  -H 'Content-Type: application/json' -d '{"is_active": false}'
curl -X POST "$API/locations/13/ask" \
  -H 'Content-Type: application/json' -d '{"question": "Is the summer promo running?"}'
```

Ultimate Combo is absent from the packages listing and from the ask answer before its
`PATCH`, and present in both after it. SUMMER is active before its `PATCH` and gone from
both the active-promo listing and the ask answer after it. Send `{"is_active": false}` to
the package path and `{"is_active": true}` to the promo path to reset the demo. In the UI
the same toggles sit next to each package and promo, and each successful save reloads only
its own panel. Every ask is written to `question_log`.

## Tests

The pure resolution unit tests need no database:

```bash
python -m unittest test_resolution -v
```

The repository and integration tests run against a real PostgreSQL database and are
skipped automatically when `DATABASE_URL` is unset:

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/ic"
python -m unittest discover -s . -p "test_*.py" -v
```

The integration suite (`test_integration.py`) loads `schema.sql` and `seed.sql`, then
exercises the FastAPI application end to end against the real database using the
FastAPI `TestClient`. It does not mock the repository. Its `POST /ask` cases cover promo,
room, and package questions, unknown-location and empty/whitespace validation, and assert
that each valid ask writes one `question_log` row holding the location id, the original
question, and the returned answer. `DemoFlowIntegrationTests` walks the demo flow above
against the real database: the San Francisco package and promo toggles, the listings and
assistant answers before and after each toggle, `404`s for unknown and other-company
packages, promos, and locations, and the `question_log` rows the demo asks produce.

The frontend tests run with the configured test runner:

```bash
cd frontend
npm install
npm test
```

`App.test.tsx` covers the same demo flow in the UI against a stubbed backend: selecting
San Francisco, viewing its packages, promos, and rooms, toggling a package and a promo,
the panel reload and updated chat answer after each successful toggle, and the error
state when a toggle fails.

## MVP scope

- Multi-tenant catalog reads scoped to `company_id` (locations, packages, active promos,
  rooms) over `DATABASE_URL`, with no ORM.
- A single pure resolution engine (`resolution.py`) for package price and availability,
  promo activation and date windows, and room-capacity fit.
- Per-location manager edits: package and promo active toggles (`PATCH`), stored as
  per-location overrides.
- A grounded `POST /ask` assistant that answers only from the resolved per-location facts,
  with every question and answer logged.
- A React manager UI for the flow above.
- Unit, repository, API, and real-PostgreSQL integration tests, plus frontend tests.

`company_id` is a temporary auth stub: `get_company_id` in `main.py` resolves every
request as `company_id` 1. Every location-scoped query still carries `company_id`, so
tenancy isolation is enforced in the data layer and a location owned by another company
returns `404`.

## Non-goals

The following are explicitly out of scope for this MVP:

- **No authentication yet** — `company_id` is a fixed stub, not a real auth or session
  layer.
- **No bookings or events yet** — the app is catalog and assistant only; nothing is
  reserved or scheduled.
- **No external LLM enabled yet** — the default `LLMProvider` is disabled and makes no
  network calls; the assistant is deterministic and grounded.
- **No production deployment yet** — local development only; there is no hosting,
  container image, or hardcoded production backend URL.

## Milestone history

Milestone 1:

- PostgreSQL schema and seed data
- Repository layer: company-scoped queries over `DATABASE_URL`, no ORM
- Resolution engine: packages, promos, and rooms
- Read-only FastAPI endpoints for locations, packages, active promos, and rooms
- Unit tests (resolution, repository, API) plus PostgreSQL integration tests

Milestone 2:

- `POST /locations/{location_id}/ask` assistant endpoint
- `assistant_context.py` assembles per-location context by reusing the resolution engine
- `assistant_answerer.py` provides a pluggable answerer behind a `Protocol`; the default
  is a deterministic, grounded answerer that replies only from the resolved per-location
  context (packages, active promos, and room capacity) and makes no LLM calls
- Every question and its returned answer are recorded through `repository.log_question`

Milestone 2.5:

- Real-database integration tests for `POST /locations/{location_id}/ask` covering promo,
  room, and package questions, unknown-location and empty/whitespace validation, and
  question logging
- Each ask is persisted to the `question_log` table (location id, original question, and
  returned answer)

Milestone 3.9:

- End-to-end demo integration tests for the San Francisco package and promo toggle flow
  against the real database, plus the matching frontend demo tests
- Seed data for the demo location (San Francisco), the Ultimate Combo package, and the
  Bay Room

## Business logic

The core catalog rules live in `resolution.py`:

- package price and availability resolution (base values plus per-location overrides)
- promo activation and date-window filtering (base values plus per-location overrides)
- room capacity filtering and ordering

`assistant_context.py` builds the assistant's per-location context by reusing
`resolution.py` instead of reimplementing any rules, and `assistant_answerer.py` holds
the answerer behind a small `Protocol`. `main.py` (transport) and `repository.py` (data
access) contain no business rules, and every location-scoped query preserves
`company_id`.
