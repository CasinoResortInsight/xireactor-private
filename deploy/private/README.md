# Private deployment overlay

This directory holds proprietary deployment configuration and documentation for
the CasinoResortInsight deployment of xireactor-brilliant.

## Layout

| Path | Purpose |
|---|---|
| `api/routes/private/` | Additional FastAPI routers. Each file exposes a `router` attribute (or named router) and is mounted via `api/main.py`'s `_route_modules` list. |
| `mcp/tools_private/` | Additional MCP tools. Each module exposes `register_private_tools(mcp, api)` and is called from `mcp/server.py` and `mcp/remote_server.py` after the upstream `register_tools(...)` call. |
| `deploy/private/` | Proprietary `render.yaml`, `docker-compose.override.yml`, branded templates, env samples. Never edit the upstream files at the repo root; override at deploy time. |
| `db/migrations/private/` | Proprietary migrations. Use the `9xx_*.sql` numbering namespace so upstream's sequential migrations never collide. Run as a separate pass after upstream migrations. |
| `tests/private/` | Pytest tree mirroring the proprietary directories. Run alongside upstream `tests/`. |

## Upstream files this overlay edits

These are the only upstream files this private branch modifies. Anything else
that "needs" editing is a candidate for a Phase-2 plugin extension point.

- `api/main.py` — one entry appended to `_route_modules` to mount the private router list.
- `mcp/server.py` — one call to `register_private_tools(mcp, api)` after `register_tools(...)`.
- `mcp/remote_server.py` — same as above for the remote MCP server.

## Syncing with upstream

```sh
git fetch upstream
git checkout upstream && git merge --ff-only upstream/main
git checkout main && git merge upstream
```

If a merge conflict appears outside the documented mount points, treat it as a
defect in the overlay design (lift the touched file to a plugin extension point
upstream).
