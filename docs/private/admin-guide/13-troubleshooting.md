# 13 — Troubleshooting

> Symptom → likely cause → fix.

**Who this is for:** the admin diagnosing a problem in production.

## Install / first-run

### `/setup` won't load — root just 404s

**Cause:** the first-run latch ([db/migrations/027_first_run_flag.sql](../../db/migrations/027_first_run_flag.sql)) is already `true`. `/setup` only responds before the latch flips.

**Fix:** use `/auth/login` instead. Sign in with the admin email and password you set initially. Signing in **rotates the admin API key** and re-renders the six-field credentials block. If you don't know the admin password, you'll need DB access to reset the latch (admin-only and not exposed via the API).

### `/health` returns 200 but `/setup` hangs

**Cause:** migrations completed but the api is in a degraded state (rare). Or your browser is hitting a cached redirect.

**Fix:**
- Hard-refresh the browser, try a private window.
- `docker compose logs api` for stack errors.
- `curl -v http://localhost:8010/setup` from the host — does the api respond?

### Installer aborts with port-probe failure

**Cause:** ports 5442 / 8010 / 8011 are all occupied across 5 step-up attempts (`+10` each).

**Fix:** stop whatever owns the ports, or set `BRILLIANT_DB_PORT` / `BRILLIANT_API_PORT` / `BRILLIANT_MCP_PORT` env vars before re-running `./install.sh`.

### Auto-generated admin key not in logs

**Cause:** you pinned `ADMIN_API_KEY` (no auto-generation), or the log line scrolled off.

**Fix:**
- Check `.env` for `ADMIN_API_KEY=...`.
- `docker compose logs api | grep -A 3 "AUTO-GENERATED ADMIN API KEY"`.
- If lost, mint a fresh session key: `POST /auth/login` with admin email + password.

## Co-work connector

### Custom-connector modal rejects the URL

**Cause:** Co-work requires public HTTPS. Localhost, private LAN IPs, and self-signed certs are all rejected.

**Fix:**
- Use Render (HTTPS by default) or expose via Cloudflare Tunnel / ngrok / a real reverse proxy with a valid certificate.
- For local-only use, switch to Claude Desktop or Claude Code (stdio MCP works on localhost).

### Browser succeeds but Claude flashes "disconnected"

**Cause:** the OAuth handoff back to the MCP failed validation. Almost always one of:

1. **`OAUTH_HANDOFF_SECRET` mismatch** between api and mcp. They MUST be the same string.
2. **Public URLs misconfigured** — the api advertises one external URL, the MCP expects another.

**Fix:**
- Compare `OAUTH_HANDOFF_SECRET` in both service envs. On Render, look for `fromService` references in [render.yaml](../../render.yaml).
- Check `BRILLIANT_API_PUBLIC_URL` (used by mcp) and `BRILLIANT_MCP_PUBLIC_URL` (used by api).

### Tools work but `manifest.user.display_name` shows the service account

**Cause:** the `X-Act-As-User` header isn't being applied — Co-work OAuth isn't binding requests to a user.

**Fix:** retrace the OAuth flow. Check api logs for `X-Act-As-User` mentions on incoming requests; if absent, the MCP isn't sending it (likely service-key issue).

## MCP / clients

### MCP can't reach the api

**Symptoms:** every tool call fails; api logs show no incoming requests.

**Causes:**
- HMAC mismatch (`OAUTH_HANDOFF_SECRET`).
- Wrong service key (`BRILLIANT_SERVICE_API_KEY` differs between services).
- Wrong upstream URL (`BRILLIANT_API_PUBLIC_URL`).
- Migration still running (api not yet healthy).

**Fix:**
- `curl <api>/health` from the mcp container/host — should return 200.
- `docker compose logs mcp` — connection errors will be explicit.
- Confirm `BRILLIANT_SERVICE_API_KEY` matches; restart both services if you change it.

### Skill version banner / refusal

**Cause:** the api's `min_skill_version` is higher than the installed skill bundle.

**Fix:**
- Re-download the skill bundle from your `/setup`'s `skill_download_url` (or fetch from `/credentials`).
- Reinstall the skill in Co-work.
- See `get_version` outcomes in [skill/SKILL.md](../../skill/SKILL.md) for the three cases.

### `api_unreachable: true` on `get_version`

**Cause:** the MCP can't reach the api right now (mid-deploy, brief network partition).

**Fix:** retry. The skill is supposed to proceed cautiously rather than refuse. If it persists, treat it as "MCP can't reach api" above.

## Search / index

### `index_too_large` (HTTP 422) on `get_index`

**Cause:** the L2+ scale guard. KB has > 200 visible entries and you called `get_index(depth >= 2)` without a narrowing filter.

**Fix:** narrow with `path=`, `content_type=`, or `tag=`. Or drop to `search_entries`. `depth=1` is always safe.

```
get_index(depth=3, tag="client-thryv")          # narrowed
get_index(depth=3, path="Projects/")            # narrowed
search_entries(tags=["a","b"], limit=20)        # ranked
```

### `[[wiki-link]]` rendering as literal text

**Cause:** write-path link sync didn't run on this entry — usually because the entry was inserted by a path that bypasses `sync_entry_links` (rare; old import tooling).

**Fix:** open the entry, save it once via `update_entry`. The save retriggers `sync_entry_links` in [api/services/links.py](../../api/services/links.py). Permanent fix is in the importer.

## Imports

### 413 Payload Too Large on `/import/vault`

**Cause:** archive exceeds 25 MB compressed or 200 MB uncompressed.

**Fix:**
- Trim large binaries (images, PDFs) before tarring.
- Split into multiple archives.
- For very large imports, run server-side via the CLI ([tools/vault_import.py](../../tools/vault_import.py)).

### Import succeeded but lots of `staged` items

**Cause:** import was run with an agent key. Agent writes always go through staging.

**Fix:** rerun with an interactive (`web_ui`) admin/editor key, or accept that the items need governance approval and run `process_staging`.

### Import wrong / want to undo

**Fix:**
```
rollback_import(batch_id="...")
```
Archives entries, removes links, purges pending staging items from the batch.

## Governance

### Tier 3 items pile up

**Cause:** `ANTHROPIC_API_KEY` not set, or `process_staging` never runs, or items legitimately need a human.

**Fix:**
- Set `ANTHROPIC_API_KEY` and restart api.
- Schedule `process_staging` periodically.
- Review Tier 4 (deletes, sensitivity changes) by hand at least weekly.

### 409 Conflict on staging update

**Cause:** optimistic concurrency. The entry version you submitted against is stale — someone else updated it first.

**Fix:** re-read the entry (`get_entry`), capture the new `expected_version`, retry.

## Permissions

### 404 on an entry the user *should* see

**Cause:** RLS hides the entry. From the user's perspective, "doesn't exist" and "can't see" are intentionally indistinguishable.

**Fix:**
- Check `manifest.user.role` for the user — does it permit reading this content_type / sensitivity?
- Check the granular permissions table for an applicable grant.
- Confirm `org_id` matches (multi-org installs only).

### Group grant doesn't seem to apply

**Cause:**
1. User isn't actually a member of that group.
2. Sensitivity ceiling forbids it (grants don't lift ceilings).
3. RLS policy issue — rare; would show in api logs.

**Fix:** verify membership in `group_members`; verify the entry's sensitivity vs. the user's role ceiling.

## Database / ops

### Migrations fail on api startup

**Cause:** a prior migration left state inconsistent, or you're running a downgrade.

**Fix:**
- Read the api log for the SQL error — usually clear (constraint violation, type mismatch).
- Restore from backup if data is at risk; do not hand-patch the migrations table.
- If on a fresh install, drop the database volume and restart.

### Disk full (`local` storage backend)

**Cause:** attachments accumulating; refcount=0 blobs not cleaned.

**Fix:** see [10-attachments-and-storage.md](10-attachments-and-storage.md). Run the zero-refcount cleanup query, then either expand the disk or migrate to S3.

## See also

- [11-observability-and-ops.md](11-observability-and-ops.md) — log queries that point at root causes.
- [12-security.md](12-security.md) — when something looks suspicious vs. broken.
- [04-configuration.md](04-configuration.md) — env vars referenced above.
