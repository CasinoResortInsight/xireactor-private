# 01 — Overview

> What Brilliant is, what it isn't, and the concepts you need to operate it.

**Who this is for:** anyone running Brilliant for the first time. Read this once, then move on.

## What Brilliant is

Brilliant is a **database-backed institutional knowledge base** for teams whose work involves both humans and AI agents. It stores entries (markdown content with structured metadata), serves them through a FastAPI REST layer, exposes the same surface to Claude through MCP, and gates writes through a four-tier governance pipeline so the KB stays trustworthy as agents start contributing.

It is **not**:

- A wiki (no page-rendering chrome, no inline editing UI in core)
- A notes app (no per-user private workspace; the KB is shared by design)
- A document store (it indexes structured entries, not arbitrary blobs — though attachments are supported)
- A general-purpose CMS

It **is** an *AI context layer*: a place where every Claude session your team runs can read and (with governance) write the same shared institutional memory.

## Core concepts

| Term | What it means |
|---|---|
| **Entry** | The unit of content. A row in `entries` with markdown body, title, tags, content_type, logical_path, sensitivity, and metadata. |
| **content_type** | The shape of an entry — `decision`, `meeting`, `project`, `system`, `daily`, etc. Defined in the `content_type_registry` table; fetched via `get_types`. |
| **logical_path** | The hierarchical "folder" string for an entry (e.g. `Projects/Atlas/Onboarding`). Used for filtering and grouping; not a real filesystem path. |
| **Tag** | A free-form label attached to an entry. Indexed across the corpus; the basis for *tag triangulation* (multi-tag AND search and tag co-occurrence). |
| **Link** | A typed directed edge between two entries. Six types: `relates_to`, `supersedes`, `contradicts`, `depends_on`, `part_of`, `tagged_with`. Synced from `[[wiki-link]]` references at write time. |
| **Governance tier** | T1–T4. Determines whether a proposed change auto-promotes (T1), is conflict-checked (T2), goes through AI review (T3), or requires a human (T4). See [07-governance-pipeline.md](07-governance-pipeline.md). |
| **LOD (Level of Detail)** | A multi-resolution view of the KB. LOD0 is the corpus silhouette, LOD2 is community-level, LOD4 is per-node, LOD6 is per-entry markdown outline. Three axes: structural, heat, epistemic. |
| **Epistemic axis** | Per-entry metadata about claim type, source confidence, verification status, and known conflicts. Lets agents reason about *what we know* vs. *what is disputed*. |
| **Anchor** | The local folder a user (typically on Co-work or Claude Desktop) connects to Brilliant. Holds `inbox/`, `outbox/`, `archive/`, and `.claude/CLAUDE.md`. |
| **RLS** | Postgres row-level security. The primary tenant- and per-user isolation mechanism. Enforced in the database, not in app code. |
| **Staging** | The induction queue for writes. Every agent write lands here before promotion. |
| **Manifest** | The compact (~≤2K-token) bootstrap object returned by `session_init`. Tells an agent *what exists and where*, without inlining content. |

## The four ways users interact

Brilliant has no single "frontend." Instead, four surfaces share the same backend:

1. **Claude Co-work (browser)** — most common for end users. Add Brilliant as a *custom connector*; Claude authenticates via OAuth and uses the MCP tools transparently. Requires public HTTPS.
2. **Claude Code / Claude Desktop (stdio)** — local MCP transport. Edit `claude_desktop_config.json` (or Claude Code's MCP config) to point at the local `mcp/server.py`. Authenticates with a service API key.
3. **REST API** — call FastAPI endpoints directly with `Authorization: Bearer <api_key>`. Used for integrations, scripts, and the `/import/vault` and `/setup` web pages.
4. **Web UI surfaces** — the API serves a few first-party HTML pages: `/setup` (first-run), `/auth/login` (recovery + key rotation), `/import/vault` (bulk upload), `/credentials` (re-fetch the six-field credentials block). There is no general-purpose web app in this repo (a separate frontend is on the roadmap).

## Architecture at a glance

```
┌──────────────────┐    ┌──────────────────┐
│ Claude Co-work   │    │ Claude Desktop / │
│ (remote / OAuth) │    │ Claude Code      │
└────────┬─────────┘    │ (stdio)          │
         │              └────────┬─────────┘
         │                       │
   ┌─────▼───────────────────────▼─────┐
   │ MCP layer  (mcp/tools.py)         │
   │  - remote_server.py (HTTP+OAuth)  │
   │  - server.py        (stdio)       │
   └─────┬─────────────────────────────┘
         │ HTTP (HMAC handoff + service key)
   ┌─────▼─────────────────────────────┐
   │ FastAPI  (api/)                   │
   │  routes: entries, search, lod,    │
   │  staging, auth, oauth, imports,   │
   │  permissions, comments, …         │
   └─────┬─────────────────────────────┘
         │
   ┌─────▼─────────────────────────────┐
   │ PostgreSQL                        │
   │  - RLS enforced (forced)          │
   │  - kb_admin / kb_editor / …       │
   │  - 33 sequential migrations       │
   └───────────────────────────────────┘
```

Direct REST clients (curl, scripts, the web UI pages) hit FastAPI without going through MCP. Every request — whether from a Co-work user, a stdio MCP, or curl — passes through the same RLS-protected query layer. There is no application-level "filter by user_id"; isolation lives in the database.

For the canonical, deeper write-up, see [ARCHITECTURE.md](../../ARCHITECTURE.md).

## What you actually run

A working deployment is **three services**:

| Service | What it does | Default port |
|---|---|---|
| `brilliant-db` (Postgres) | Stores everything. Owns RLS. | 5442 |
| `brilliant-api` (FastAPI) | REST API + first-party web pages. | 8010 |
| `brilliant-mcp` | MCP server (stdio + remote modes). | 8011 |

Plus one **persistent disk** (or S3 bucket) for attachment blobs at `/data` (default ~1 GB on Render).

## See also

- [02-deployment-options.md](02-deployment-options.md) — pick the deployment shape that fits.
- [12-security.md](12-security.md) — what makes the architecture defensible.
- [14-glossary.md](14-glossary.md) — one-line definitions if any of the terms above were new.
