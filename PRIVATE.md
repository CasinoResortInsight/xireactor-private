# Private overlay workflow

This is the entry-point document for working in `CasinoResortInsight/xireactor-private`. The upstream [README.md](README.md) covers the public xireactor-brilliant project; this document covers the private-fork-specific concerns: directory conventions, sync workflow, adding proprietary features, and deploying.

## What this repo is

A private fork of [thejeremyhodge/xireactor-brilliant](https://github.com/thejeremyhodge/xireactor-brilliant) (Apache-2.0). Proprietary code is added in dedicated `private/` subdirectories so upstream releases merge cleanly. Nothing in this repo is published anywhere public.

## Repo layout

| Path | Content | Touch upstream? |
|---|---|---|
| `api/routes/private/` | Proprietary FastAPI routers. | No |
| `mcp/tools_private/` | Proprietary MCP tools. | No |
| `deploy/private/` | Branded `render.yaml`, `docker-compose.override.yml`, templates, env samples. | No |
| `db/migrations/private/` | Proprietary migrations, numbered `9xx_*.sql`. Run as a separate pass after upstream migrations. | No |
| `tests/private/` | Pytest tree mirroring the above. | No |
| **Mount points** ↓ | | |
| `api/main.py` | One entry appended to `_route_modules` per private router. | **Yes — 1 line per router** |
| `mcp/server.py`, `mcp/remote_server.py` | One `register_private_tools(mcp, api)` call after `register_tools(...)`. | **Yes — 1 line each** |

**Rule:** never edit an upstream file except the documented mount points. Anything that feels like it needs more invasive editing should be flagged for a separate design pass.

## Branches

- `upstream` — local mirror of `https://github.com/thejeremyhodge/xireactor-brilliant@main`. Never hand-edited. Updated only by `git merge --ff-only upstream/main`.
- `main` — deployment branch. Contains `upstream` plus all proprietary commits. This is what gets deployed.

## Adding a new proprietary feature

### A new HTTP endpoint

1. Create `api/routes/private/<feature>.py`:
   ```python
   from fastapi import APIRouter

   router = APIRouter()

   @router.get("/thing")
   def get_thing() -> dict:
       return {"ok": True}
   ```
2. Add one line to `_route_modules` in `api/main.py`:
   ```python
   ("routes.private.<feature>", "router", "/private"),
   ```
3. Add tests under `tests/private/test_<feature>.py` (use FastAPI `TestClient` against the bare router, as in `tests/test_version.py`).
4. Commit on `main` with a clear message.

### A new MCP tool

1. Add the tool to `mcp/tools_private/__init__.py` (or split into submodules under `mcp/tools_private/`). Use the same decorator pattern as `mcp/tools.py`:
   ```python
   def register_private_tools(mcp, api) -> None:
       @mcp.tool()
       def my_private_tool(...) -> dict:
           ...
   ```
2. No further wiring needed — `register_private_tools(mcp, api)` is already called from both `mcp/server.py` and `mcp/remote_server.py`.
3. Add tests under `tests/private/`.

### A new database table

1. Create `db/migrations/private/9NN_<description>.sql`. Use the `9xx_` numbering namespace to avoid colliding with upstream's sequential numbering (currently up to `021_*`).
2. Make the migration idempotent (`CREATE TABLE IF NOT EXISTS`, etc.).
3. Run **after** upstream migrations as a separate pass in your deploy pipeline. The upstream migration runner is unaware of `db/migrations/private/`.
4. Add a corresponding RLS policy following the patterns in `db/migrations/004_rls.sql`. Every table with user data must have RLS enabled and an `org_id = current_setting('app.org_id')` predicate.

## Syncing from upstream

Run this whenever you want to pick up new upstream releases (after each tagged release of the public repo is a good cadence):

```sh
cd ~/xireactor-private

# 1. Refresh the local upstream mirror
git fetch upstream
git checkout upstream
git merge --ff-only upstream/main

# 2. Bring upstream into the deployment branch
git checkout main
git merge upstream
```

### Expected outcome

- **Most merges:** zero conflicts. New upstream files just appear. Modified upstream files don't conflict because we only touch the documented mount points.
- **Occasional merges:** small mechanical conflicts in `api/main.py`, `mcp/server.py`, or `mcp/remote_server.py` when upstream adds new routers/tools near our insertion points. Resolution is usually `accept both`. Two or three lines max.
- **Red flag:** a conflict in any other upstream file means either (a) the discipline slipped and we edited an upstream file we shouldn't have, or (b) upstream made a load-bearing change that the overlay needs to adapt to. Investigate before resolving.

### After a merge, verify

```sh
# Diff the deployment branch against pristine upstream — should only touch
# the documented mount points and net-new files under private/ directories.
git diff upstream main -- api/ mcp/ db/ deploy/ tests/ | head -60

# Run upstream's test suite — should pass unchanged.
pytest tests/  # excluding tests/private/ for a moment

# Run private tests.
pytest tests/private/

# Boot the stack and smoke-check.
docker compose up -d
curl localhost:8000/private/ping  # or whatever endpoint exists
```

## Deployment

The deployment recipe is whatever you put under `deploy/private/` — typically `docker-compose.override.yml` on top of upstream's `docker-compose.yml`, or a branded `render.yaml`. Two specifics worth calling out:

- **Env vars.** Maintain a `deploy/private/.env.sample` listing all proprietary env vars on top of upstream's `.env.sample`. Never commit a populated `.env` file.
- **Migrations.** Your deploy pipeline runs upstream migrations first, then runs `db/migrations/private/*.sql` as a separate pass. Both passes should be idempotent.

## Apache-2.0 hygiene

Upstream is Apache-2.0. Two practices that keep provenance clean:

- The `NOTICE` file at repo root attributes upstream. Don't remove it.
- Header proprietary source files with your own copyright (e.g. `# Copyright 2026 CasinoResortInsight`). This makes the boundary between Apache-2.0 and proprietary code unambiguous on inspection.

You are **not** required to publish proprietary code, even when distributing binaries — Apache-2.0 has no copyleft. See [Apache-2.0 §4](LICENSE).
