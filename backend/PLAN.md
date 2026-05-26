# KB Backend (Admin Console) — Implementation Plan

## What we're building

An interactive, real-time web console for managing the Brilliant knowledge base. Unlike `tools/build_kb_demo.py` — which produces a static, read-only HTML snapshot — this is a live SPA backed by the existing FastAPI server at `api/`. It gives an admin/operator:

- A **dashboard** with live statistics on the database.
- **Search** across entries (title, content, tags, type, folder, sensitivity).
- **CRUD** on entries (create, read, update, delete, append).
- Plus a handful of features that fall out naturally from the existing API and make the tool actually useful for day-to-day ops.

## Why a separate folder, not a fork of build_kb_demo.py

`build_kb_demo.py` is a one-shot exporter: it fetches everything, inlines it into a single HTML file, and ships. There's no write path, no auth flow, no streaming. The admin console needs:

- Live reads (no stale snapshot).
- Authenticated writes (entry create/update/delete).
- Pagination/streaming (the DB will grow past what fits in one JSON blob).
- A real router and state.

So `backend/` is a new app. The demo script stays as-is for the read-only management share-out.

## Architecture

```
backend/
├── PLAN.md                  ← this file
├── README.md                ← (added in Phase 1) how to run it
├── server/                  ← thin Python proxy + static host
│   ├── app.py               ← FastAPI app: serves /api/* (proxy) and /  (SPA)
│   ├── auth.py              ← session-cookie passthrough to the main API
│   └── requirements.txt
├── web/                     ← SPA (vanilla TS or React+Vite — see decision below)
│   ├── index.html
│   ├── src/
│   │   ├── main.ts
│   │   ├── api.ts           ← typed client for /entries, /tags, /graph, /analytics
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Search.tsx
│   │   │   ├── EntryList.tsx
│   │   │   ├── EntryEdit.tsx
│   │   │   └── Graph.tsx
│   │   ├── components/
│   │   └── styles.css
│   └── package.json
└── Dockerfile               ← single image; nginx for /web, uvicorn for /api proxy
```

### Why a proxy server in front of the existing API

Two reasons:

1. **CORS / cookie scope.** The admin SPA and the main API can be deployed under one origin via the proxy, so session cookies just work without CORS gymnastics.
2. **Server-side aggregation.** The dashboard wants counts the existing API doesn't expose as one call (e.g. "entries per content_type per week"). The proxy can compose these from existing endpoints, or hit the DB read replica directly for the few queries we'd otherwise need to add to `api/`. Keeps the main API surface clean.

If the second reason turns out not to apply (the dashboard fits inside existing `/analytics` + `/index`), we drop the proxy and serve the SPA as static files from the main `api/` app under `/admin`. Decide at the end of Phase 1.

### Stack decision (needs your sign-off)

- **Frontend:** React + Vite + TypeScript. Reason: the admin has real interactivity (live search, modal edit, optimistic updates, graph zoom) and the team has more leverage with a component framework than with hand-rolled vanilla DOM (which is what `build_kb_demo.py` does and which would not scale to write flows).
- **Graph:** `cytoscape.js` (or `react-force-graph`) instead of the hand-rolled force layout in the demo — better perf past ~200 nodes, built-in pan/zoom, lasso select.
- **Styling:** Tailwind, matching the existing dark/light tokens from `build_kb_demo.py` so the look carries over.
- **Server proxy:** FastAPI (matches the main `api/`).

Alternatives if you'd rather: Svelte + Vite (lighter); or skip the SPA and use HTMX with server-rendered partials from a FastAPI route (much less JS, but worse for the graph view).

## Phases

### Phase 1 — Skeleton + Dashboard (read-only)

Goal: standing up the app, talking to the live API, showing real numbers. No writes yet.

- `backend/server/app.py`: FastAPI app, `/api/{path}` reverse-proxies to `BRILLIANT_API_BASE`, forwards `Authorization` header / session cookie.
- `backend/web/`: Vite + React + TS scaffold; one route `/` = Dashboard.
- Dashboard tiles (all sourced from existing endpoints):
  - Total entries, by `content_type`, by `sensitivity` — from `GET /entries?limit=…` paginated, cached.
  - Entries created/updated in the last 7d and 30d — from `updated_at` on entries.
  - Top tags (count) — from `GET /tags`.
  - Top entries by traffic — from `GET /analytics/top-entries`.
  - Link graph stats: total edges, orphan entries (no links in/out) — computed client-side from `GET /graph`.
- Auth: simplest possible — admin pastes their API key into a settings page, stored in `localStorage`; proxy attaches it as `Authorization: Bearer …`. (Phase 5 upgrades this to a real login.)

**Exit criteria:** open `localhost:5173`, see live stats from the local API, refresh updates them.

### Phase 2 — Search + Entry list/detail

Goal: find anything, read anything.

- Search bar with debounced live results. Backed by an existing search endpoint if there is one; otherwise the proxy implements `/api/search?q=…` by combining `GET /entries` (pagination) with server-side substring match. Note in code which path we took.
- Entry list view: virtualized table, columns = type | title | folder | tags | updated. Filters: type, sensitivity, folder (tree like the demo's sidebar), tag.
- Entry detail view: rendered markdown (reuse the renderer from `build_kb_demo.py`, ported to TS), incoming/outgoing link rails, metadata panel.

**Exit criteria:** can locate any entry in <3 clicks; entry detail matches what `build_kb_demo.py` shows.

### Phase 3 — CRUD

Goal: create, edit, delete entries from the UI.

- "New entry" modal: title, content (markdown editor — `@uiw/react-md-editor` or similar), `logical_path`, `content_type`, `sensitivity`, tags. POSTs to `/entries`.
- Edit: same form, prefilled. PUTs. Optimistic update with rollback on error.
- Append: dedicated quick-append textarea on entry detail (uses `PATCH /entries/{id}/append`).
- Delete: confirm dialog, then `DELETE /entries/{id}`. Soft-undo banner if the API supports restore; otherwise a 5-second toast.
- All mutations refresh the affected entry and any list it appears in.

**Exit criteria:** full lifecycle works end-to-end against the real API, including error states (validation failures, permission denied, conflict).

### Phase 4 — Real-time + Graph

Goal: it actually feels live, and the link graph is useful.

- **Real-time updates.** Two options, pick one when we get here:
  - (a) Poll `GET /index?since=<ts>` every 10s, diff against client cache. Simple, works today.
  - (b) Add a WebSocket / SSE endpoint to the main API that broadcasts entry mutations. Better, but requires changes in `api/`.
  - Default to (a) for Phase 4; revisit (b) if multi-user editing becomes a real workflow.
- **Graph view.** Full-page interactive: cytoscape with pan/zoom, click-to-open, filter by type/tag, "show only neighbors of X." Uses `GET /graph`.

**Exit criteria:** two browser windows open on the same entry — edit in one, see the change in the other within 10s. Graph handles 500+ nodes without jank.

### Phase 5 — Polish + features that fell out

Recommended additions (each is small once the framework is there):

- **Staging review.** Existing API has `/staging` endpoints — surface them so an admin can review/promote/reject queued entries.
- **Tags admin.** Rename tag, merge tags, see co-occurrence (existing endpoint).
- **Audit / activity log.** Stream of recent mutations (who, when, what) — needs a small `/api/audit` proxy endpoint or just reads `updated_at` + `version` from entries.
- **Bulk operations.** Multi-select in the list view → bulk tag, bulk move folder, bulk delete.
- **Export.** "Snapshot current view to HTML" button that calls into `tools/build_kb_demo.py` logic — preserves the share-out workflow.
- **Real auth.** Replace the localStorage API-key with the main API's session login (the proxy already forwards cookies, so this is mostly UI work).

### Phase 6 — Claude chat (English Q&A + agent actions)

Goal: a chat panel in the admin where you can ask things like "what did we decide about the snack bar refresh?" or "draft a meeting note from these bullets and file it under /meetings/2026/05" and have Claude actually do it.

**Approach:** use the **Claude Agent SDK** (Python, `claude-agent-sdk`) inside the backend proxy. The SDK is the same engine that powers the `claude` CLI — it handles streaming, tool use, sessions, and context management for us. We do **not** shell out to the `claude` CLI; the SDK gives us proper streaming and structured tool events that we can render in the UI.

Why this fits cleanly:

- The repo already has a **Brilliant MCP server** (`mcp/`, exposing `mcp__brilliant__search_entries`, `get_entry`, `create_entry`, etc.). We point the SDK agent at that MCP server, so the chat is automatically KB-aware — it can search, read, and (with confirmation) write entries using the same code paths the rest of the admin uses.
- The proxy already holds the API key/session, so the agent's MCP calls inherit the same auth as the rest of the UI.

**Server side (`backend/server/`):**

- New module `chat.py` that wraps `claude_agent_sdk.query(...)` (or `ClaudeSDKClient` for multi-turn).
- New endpoint `POST /api/chat` (SSE or chunked response) that streams `AssistantMessage`, `ToolUseBlock`, and `ResultMessage` events back to the browser as JSON-lines. One session per browser tab; session id round-trips in the URL/state.
- System prompt seeds the agent with: "you are the KB admin assistant, the user is an authenticated admin, the Brilliant MCP server is available, prefer reading before writing, ask before destructive ops."
- Write tools (`create_entry`, `update_entry`, `delete_entry`) are gated by a `permission_mode` setting: default `acceptEdits=false`, so the UI shows a confirm prompt before any mutation runs. Reads are auto-approved.

**Client side (`backend/web/`):**

- New `Chat` panel (slide-out drawer, available from every page so context-sensitive prompts like "summarize this entry" work — the panel grabs the current route's entry id and includes it in the user message).
- Renders the streamed event types: assistant text (markdown), tool calls (collapsed by default, expandable to show inputs/outputs), tool-approval prompts (Approve / Deny buttons that resume the agent).
- Reuses the markdown renderer from Phase 2.

**Scope guardrails for v1:**

- One agent session per tab, no cross-tab state.
- No file-system or shell tools — only the Brilliant MCP tools and `WebSearch` are exposed. (We are deliberately *not* giving this agent Bash or Edit, because it's operating against a production KB, not a dev workspace.)
- Cost cap: per-session max-turn limit (e.g. 30) and a server-side daily token budget that returns a friendly error when exceeded.

**Exit criteria:**

- "Find the most recent decision about X" returns a streamed answer with citations (clickable `/kb/<id>` links).
- "Create a daily note for today with these three bullets" produces a confirm dialog showing the proposed entry, and on approval files it and shows the new entry in the list within one refresh.
- Closing and reopening the panel resumes the same session.

Phase 6 depends on Phase 3 (CRUD) being stable — the agent should reuse the same write endpoints the manual UI uses, so we get one audit trail and one set of validations.

## Decisions locked in (2026-05-26)

1. **Stack:** React + Vite + TypeScript, FastAPI proxy. ✅
2. **Auth in Phase 1:** start with paste-your-API-key in localStorage; real session login is a Phase 5 item. ✅
3. **Deployment:** local-only for now. No `render.yaml` / `deploy/` changes. ✅
4. **Dashboard tiles:** Phase 1 list is fine; iterate based on what we actually want to see once it's live. ✅
5. **Claude chat:** added as Phase 6 above. ✅

Phase 1 is next.
