# 11 — Observability & Ops

> Day-2: monitoring, backup, restore, upgrades.

**Who this is for:** the admin past install — keeping the stack healthy.

The deep reference for log tables and dashboard SQL is [docs/OBSERVABILITY.md](../OBSERVABILITY.md). This page adds an admin lens.

## Health endpoints

| Endpoint | Returns | Use for |
|---|---|---|
| `GET /health` | `{"status":"ok",...}` | Liveness check. Every install/upgrade should poll this. |
| `GET /version` | `{"api_version":..., "min_skill_version":..., "latest_skill_version":...}` | Version handshake; checked by the skill on session start. |
| `GET /metrics` (if enabled) | (varies) | Future Prometheus surface; not required reading today. |

## Logs

| Log | Where | What's in it |
|---|---|---|
| **Container stdout/stderr** | `docker compose logs api` / `... mcp` / `... db`, or Render Logs tab | Application logs, startup info, errors, the auto-generated admin key on first run. |
| **`request_log` (table)** | Postgres | Per-HTTP-request row: method, path, status, latency, approximate token usage, actor. RLS-scoped (admin sees all org rows). |
| **`entry_access_log` (table)** | Postgres | Per-entry-read: actor, entry_id, timestamp. Drives the LOD heat axis. |
| **`audit_log` (table)** | Postgres | Append-only mutation log written by the admin role. Captures every write, permission change, governance action. |

`docs/OBSERVABILITY.md` has the SQL for ops dashboards. A few admin starters:

```sql
-- Slowest endpoints in the last hour
SELECT path, count(*), avg(latency_ms)::int AS avg_ms, max(latency_ms) AS max_ms
FROM request_log
WHERE created_at > now() - interval '1 hour'
GROUP BY path
ORDER BY avg_ms DESC LIMIT 20;

-- Most-read entries this week
SELECT entry_id, count(*) AS reads
FROM entry_access_log
WHERE created_at > now() - interval '7 days'
GROUP BY entry_id
ORDER BY reads DESC LIMIT 20;

-- Recent agent writes through staging (any tier)
SELECT created_at, target_path, change_type, governance_tier, status
FROM staging
WHERE source = 'agent'
ORDER BY created_at DESC LIMIT 50;
```

## Backup & restore

### What to back up

1. **Postgres** — full dump. This is 95% of your data.
2. **Attachment bytes** — the persistent disk (`local`) or your S3 bucket.
3. **Secrets** — env vars holding `OAUTH_HANDOFF_SECRET`, `BRILLIANT_SERVICE_API_KEY`, OAuth client secret, `LOCAL_STORAGE_SIGNING_KEY`, `ADMIN_API_KEY` (if pinned).

### Postgres dump

```bash
# From inside the db container (or via your managed-Postgres tool)
pg_dump --format=custom --file=brilliant.dump $DATABASE_URL
```

Custom format compresses well and lets you restore selectively. Schedule daily; retain at least 7 days.

### Restore drill

```bash
# Into a fresh Postgres (e.g. a sandbox container)
createdb brilliant_restore
pg_restore --dbname=brilliant_restore brilliant.dump
```

Then point a throwaway api at it (`DATABASE_URL=postgresql://.../brilliant_restore`) and verify `/health`, list entries, and fetch one with an attachment. If any of those fail, fix your backup process before you need it.

### Disk / S3 sync

For `local`: snapshot the volume daily, or `rsync` `/data/uploads` to off-host storage.

For `s3`: enable bucket versioning and a lifecycle rule that retains ≥30 days of versions. Then "backup" is implicit.

## Upgrading

The stack uses sequential numbered SQL migrations in [db/migrations/](../../db/migrations/) (`001_…` through `033_epistemic_axis.sql` at v0.9.0). Each migration is meant to be run forward exactly once; there's no rollback DSL today.

### Render

1. The Blueprint pins to `main` by default. To upgrade: trigger a fresh deploy (Render rebuilds the images and runs `preDeployCommand` which executes new migrations).
2. To pin to a specific tag: edit `render.yaml` and re-deploy.

### `install.sh`

```bash
cd xireactor-brilliant
git fetch --tags
git checkout v0.x.y                 # or main
docker compose pull                  # if using prebuilt images
docker compose down
docker compose up -d                 # migrations run on api startup
curl http://localhost:8010/health
```

For a clean reinstall on a fresh box: `./install.sh --ref v0.x.y`.

### Migration safety

- Migrations are applied in numeric order at api startup.
- The api refuses to start if a migration fails — check `docker compose logs api` for the SQL error.
- **Take a backup before upgrading.** The migrations are forward-only; a botched upgrade is recovered by restoring from backup.
- Read the [CHANGELOG.md](../../CHANGELOG.md) entry for the version you're moving to. Major version bumps have called out compatibility breaks (skill version handshake, OAuth handoff, etc.).

### Skill compatibility

The skill bundle and the api have a version handshake (see [05-connecting-clients.md](05-connecting-clients.md)). When you upgrade the api, the api advertises a new `min_skill_version`. If your team uses an older skill, they'll get a refusal banner until they update the bundle.

The download URL is part of the six-field credentials surface (`/setup` and `/auth/login`). Re-distribute the new skill zip to your team after upgrade.

## Health monitoring (external)

In production:

1. Point an uptime monitor (Better Uptime, UptimeRobot, your Grafana Synthetics) at `GET /health`. Alert on 5xx or non-200.
2. Add a second probe on `GET /version` to catch deploy mismatches (api running but not the version you expected).
3. (Optional) periodically run `bash tests/demo_e2e.sh` against staging to catch regressions before they hit prod.

## Capacity warning signs

| Signal | Likely cause | Action |
|---|---|---|
| `request_log` p99 latency rising on read endpoints | Postgres CPU saturated, or the embedding column is bloating | Bump DB tier; consider an index check on `entries.tsvector` |
| `staging` size growing without bound | `process_staging` not running, or no admin reviewing T4 | Schedule `process_staging` (cron'd curl); add Tier 4 to weekly admin review |
| `/data` filling up (local backend) | Attachments accumulating | Migrate to S3, or run the zero-refcount cleanup query |
| 422 `index_too_large` errors spiking | Users running `get_index(depth >= 2)` without filters on a now-large KB | Communicate the L2+ guard; encourage `tag=` / `path=` filtering |

## See also

- [docs/OBSERVABILITY.md](../OBSERVABILITY.md) — full dashboards and SQL reference.
- [12-security.md](12-security.md) — `audit_log` queries for security-relevant events.
- [13-troubleshooting.md](13-troubleshooting.md) — symptoms and recipes.
