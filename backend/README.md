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

**Phase 3 — CRUD.** Create new entries via the "+ New entry" button on the list view (title / type / sensitivity / folder / summary / tags / markdown content). Edit any entry from the detail view — uses optimistic-concurrency `expected_version` so concurrent edits are detected. Quick-append textarea on the detail view (PATCH `/entries/{id}/append`). Archive (soft-delete) via a confirm modal. Toast feedback on every mutation; all open views auto-refresh after a write.

**Phase 4 — Real-time + Graph.** Background poll every 10s on `GET /entries?limit=1` (sorted by `updated_at DESC`); when the newest timestamp advances past what the tab last saw, every subscribed view (dashboard, list, current entry) refetches automatically. Polling pauses while the tab is backgrounded. New `#/graph` view: full-page interactive cytoscape graph with pan/zoom, content_type filter, click-to-open, and shift-click to focus on a node's 1-hop neighborhood.

> **Note:** Phase 4 adds new npm dependencies (`cytoscape`, `@types/cytoscape`). After pulling these changes, run `npm install` in `backend/web/` before `npm run dev`.

**Phase 5 — Polish.** Six features:

- **Staging review** (`#/staging`) — pending/approved/rejected tabs; expand a row to preview proposed markdown; approve (promote to a live entry) or reject with an optional reason. Admin-only actions are role-gated.
- **Tags admin** (`#/tags`) — list tags with counts, co-occurrence (with Jaccard) for a selected tag, and **rename / merge / delete** as client-side bulk rewrites (no tag-mutation API endpoint), with live progress and version-conflict retry. Admin-only.
- **Activity log** (`#/activity`) — recent-changes feed reconstructed from entries ordered by `updated_at` (who/when/version) plus the pending staging queue. The API has no append-only audit trail.
- **Bulk operations** — multi-select rows in the list view → bulk add-tag / move-folder / archive, with a progress indicator. Client-side fan-out of single-entry writes.
- **Export** — "Export HTML" button downloads a self-contained snapshot built by the backend's `/export` endpoint, which reuses `tools/build_kb_demo.py` (same artifact as the share-out workflow).
- **Identity / auth** — the stored key is validated against `/session`; the top bar shows your display name + role, and admin-only features are gated by it. Settings also offers an **email/password login** that calls `POST /login` — but this **rotates your API key** (revokes all existing keys), so it's a clearly-warned opt-in; pasting an existing key remains the default.

**Phase 6 — Claude chat.** An "Ask AI" panel (every page) talks to an embedded **Claude Agent SDK** agent over a WebSocket. The agent is wired to the existing Brilliant MCP server, so it can search/read/write the KB through the same code paths as the rest of the console. Read-only tools auto-run; **writes pause for an inline Approve/Deny** in the panel. The current entry is attached as context, so "summarize this entry" works. Streamed assistant text renders as markdown; tool calls are shown collapsed. The conversation survives closing/reopening the panel.

### Enabling chat

Chat needs two extra things on the **server** side (the rest of the console works without them):

1. `pip install -r backend/server/requirements.txt` now includes `claude-agent-sdk` (Python 3.10+).
2. Set `ANTHROPIC_API_KEY` in the proxy's environment. See [`server/.env.example`](server/.env.example).

```bash
cd backend/server && source .venv/bin/activate
pip install -r requirements.txt
ANTHROPIC_API_KEY=sk-ant-… BRILLIANT_API_BASE=http://localhost:8010 \
  uvicorn app:app --reload --port 8012
```

**MCP transport (local vs remote).** By default the agent launches the local stdio MCP server (`mcp/server.py`) — so the interpreter running the proxy must be able to import `mcp/`'s dependencies. To point at a **remote HTTPS MCP** server instead, set `BRILLIANT_MCP_URL`; tool names are namespaced identically (`mcp__brilliant__*`) so nothing else changes. The chat acts with the API key you're using in the console.

**Guardrails:** `KB_CHAT_MAX_TURNS` (default 30) and `KB_CHAT_DAILY_USD_BUDGET` (default $5, per process) cap runaway cost. Writes always require explicit approval.

## Multiple knowledge bases

The console can switch between several Brilliant instances hosted in different locations. Open **Settings → Knowledge bases** and add a connection per KB: a name, an API base URL, an API key (paste one, or fetch via email login), and an optional remote MCP URL for chat. The active connection drives every request — its key goes out as `Authorization: Bearer …` and its base as an `X-KB-Base` header that the proxy uses to choose the upstream. The active KB name shows in the top bar; switching reloads the console so all views, identity, and the chat reconnect against the chosen KB.

A blank base URL means "use the proxy's own default upstream" (`BRILLIANT_API_BASE`) — handy for local dev. To restrict which upstreams the proxy will forward to, set `BRILLIANT_ALLOWED_BASES` (see `server/.env.example`). Connections live in the browser's `localStorage`; an older single pasted key is migrated into a "Default" connection automatically.

## What's next

All six planned phases are implemented. Future ideas: true SSE/WS push from `api/` (replace polling), server-side batch endpoints for tag/bulk ops, and cross-reload chat session resume via `resume=<session_id>`.
