# I See (IC) — Sample UI

A design prototype for **I See** — pronounced *"IC"* — a knowledge platform that gives
multi-location businesses **location-specific answers**.

> **Company knowledge + location overrides = location-specific answers.**

The name is a play on words: the logo reads **IC**, and it sounds like **"I see"** —
fitting for a product whose job is to *see* what's actually true at each location.

This is a front-end prototype only (no backend). All data lives in `src/App.tsx` and
persists to the browser's `localStorage`.

## Run

```bash
npm install
npm run dev
```

Then open the printed `localhost` URL. Use `npm run build` for a production build.

## Screens

- **Landing** — the pitch and how it works.
- **Dashboard** (managers) — pick a location, then manage:
  - **Packages** — add / edit / delete, per-person pricing with **2 hr / 3 hr** options and
    separate **Mon–Thu** vs. **Fri–Sun & holiday** prices.
  - **Promotions** — add / edit / delete events with editable **start / end** dates.
  - **Rooms** — capacity, quantity, and a status of **Available / Reserved / Out of service**,
    with a **queue of reservation time slots** (start + end) per room.
  - **AI assistant** — answers questions scoped to the selected location.
- **Customer chat** — guests ask about packages, promotions, and rooms; answers reflect the
  manager's saved data.

## Notes

- **Per-person pricing.** Weekend/holiday price = `Mon–Thu × PEAK_MULTIPLIER`
  (default `1.2`, i.e. +20%). Change the constant near the top of `src/App.tsx`.
- **Edits persist** across refresh. **Reset demo data** (dashboard header) restores the seeds.
- All copy and mock data live in `src/App.tsx`; all styling in `src/styles.css`.
