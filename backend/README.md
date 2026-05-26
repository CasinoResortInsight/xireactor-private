# KB Admin — Backend

Interactive admin console for the Brilliant knowledge base. See [PLAN.md](./PLAN.md) for the full roadmap. This README covers running Phase 1 locally.

## Architecture

```
browser  ──fetch /api/*──▶  FastAPI proxy (server/, :8012)  ──forward──▶  main API (:8010)
   └────── fetch /  ──────▶  Vite dev server (web/, :5173)  ─── /api/* proxied to :8012
```

In dev the SPA runs on Vite at `:5173` and `vite.config.ts` proxies `/api/*` to the FastAPI on `:8012`, which forwards to the Brilliant API on `:8010`. The browser only ever talks to `:5173`.

## Prereqs

- Python 3.10+ and Node 18+
- The main Brilliant API running locally on `http://localhost:8010` (or set `BRILLIANT_API_BASE`)
- A Brilliant API key (paste it into Settings on first load)

## Run

Two terminals.

**Terminal 1 — proxy:**

```bash
cd backend/server
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
BRILLIANT_API_BASE=http://localhost:8010 \
  uvicorn app:app --reload --port 8012
```

**Terminal 2 — SPA:**

```bash
cd backend/web
npm install
npm run dev
```

Open <http://localhost:5173>. On first load you'll be prompted for an API key — paste it in, hit Save, and the dashboard will populate.

## What's working

**Phase 1 — Dashboard.** Live tiles for entry totals, content-type and sensitivity breakdowns, 7d/30d update activity, tag count, graph nodes/edges, orphan count, top tags. Settings drawer for the API key (stored in `localStorage`). Health indicator for proxy → upstream reachability.

**Phase 2 — Search + entries.** Entries table at `#/entries` with debounced free-text search (`q`) and filters for content_type, folder prefix, and tag. Pagination at 50/page. Click a row to open the entry detail at `#/entries/{id}` — full markdown rendering (ported from `tools/build_kb_demo.py`), wikilink + `/kb/<uuid>` resolution, metadata sidebar with incoming/outgoing link rails derived from `/graph`.

## What's next

Phase 3 (CRUD), Phase 4 (real-time + graph view), Phase 5 (polish: staging, audit, bulk ops, real auth), Phase 6 (Claude chat). See [PLAN.md](./PLAN.md).
