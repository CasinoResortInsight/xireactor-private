# 04 — Configuration

> Every environment variable, what it does, where it's read, and what happens if you change it.

**Who this is for:** the operator tuning a running stack.

## Where config lives

- **`.env`** at the repo root — read by `docker-compose.yml` for local installs.
- **Render dashboard env vars** — managed UI on Render. The Blueprint pre-creates most of them.
- **Process environment** — both api and mcp processes read directly from `os.environ` / `os.getenv`.

There is **no separate config file**. Everything is environment variables.

## Variable reference

### Core (all deployments)

| Variable | Scope | Default | Effect |
|---|---|---|---|
| `DATABASE_URL` | api | (set by compose / Render) | Postgres connection string. The api opens a connection pool against this. |
| `ADMIN_EMAIL` | api (bootstrap) | required | The email address used to create the initial admin user during the `/setup` ceremony. |
| `ADMIN_PASSWORD` | api (bootstrap, optional) | unset | If set at first run, skips the `/setup` password prompt. Otherwise the user picks one in the browser. |
| `ADMIN_API_KEY` | api (bootstrap, optional) | unset | Pin a specific admin API key. If unset, an auto-generated key is logged once at startup. |
| `ADMIN_ORG_NAME` | api (bootstrap, optional) | "Default" | Name of the seeded organization. |
| `POSTGRES_PASSWORD` | db | required | Postgres superuser password. |

### Networking & URLs

| Variable | Scope | Default | Effect |
|---|---|---|---|
| `BRILLIANT_DB_PORT` | host | 5442 | Host-side port mapped to Postgres. Auto-probed by `install.sh`. |
| `BRILLIANT_API_PORT` | host | 8010 | Host-side port mapped to FastAPI. |
| `BRILLIANT_API_HOST` | api | 0.0.0.0 | Bind address inside the api container. |
| `BRILLIANT_MCP_PORT` | host / mcp | 8011 | Host-side port mapped to the remote MCP server. |
| `BRILLIANT_API_PUBLIC_URL` | mcp | derived | The URL the MCP uses to reach the api. On Render, `RENDER_EXTERNAL_URL` is used. |
| `BRILLIANT_MCP_PUBLIC_URL` | api | derived | The public URL of the MCP, embedded in the six-field credentials surface. |
| `MCP_BASE_URL` | tests / clients | — | Override base URL for MCP test scripts. |
| `API_BASE_URL` | tests | `http://localhost:8010` | Override base URL for `tests/demo_e2e.sh` and other scripts. |
| `PORT` | (Render) | injected | Render injects this for each service; the api/mcp respect it. |
| `RENDER_EXTERNAL_URL` | (Render) | injected | Render injects this; the app uses it to derive public URLs. |

### Authentication & OAuth

| Variable | Scope | Default | Effect |
|---|---|---|---|
| `OAUTH_HANDOFF_SECRET` | api + mcp | minted by installer | HMAC-SHA256 secret used to sign the redirect handoff between MCP `/authorize` and api `/oauth/login`. **Must be identical on both services.** |
| `BRILLIANT_SERVICE_API_KEY` | mcp | minted by installer | The service-role API key the MCP uses to call the api. Honors `X-Act-As-User`. Treat as critical. |
| `TOKEN_EXPIRY_SECONDS` | mcp | (default in code) | Lifetime of issued OAuth access tokens. |

### AI / governance

| Variable | Scope | Default | Effect |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | api | unset | Enables the Tier 3 AI reviewer (`api/services/ai_reviewer.py`). When unset, Tier 3 items stay `pending` until manual review. See [07-governance-pipeline.md](07-governance-pipeline.md). |

### Storage (attachments)

| Variable | Scope | Default | Effect |
|---|---|---|---|
| `STORAGE_BACKEND` | api | `local` | `local` or `s3`. Selects the attachment backend. |
| `LOCAL_STORAGE_ROOT` | api | `/data/uploads` | Root directory for local-backend blobs. Backed by the persistent disk on Render. |
| `LOCAL_STORAGE_SIGNING_KEY` | api | minted | HMAC key used to sign download URLs for local-backend blobs. |
| `MAX_ATTACHMENT_BYTES` | api | (default in code) | Per-file upload cap. |
| (S3 backend) | api | — | When `STORAGE_BACKEND=s3`, the standard S3-compatible env vars apply. See [docs/ATTACHMENTS.md](../ATTACHMENTS.md) for the full list. |

### Other

| Variable | Scope | Default | Effect |
|---|---|---|---|
| `MCP_TEST_URL` | tests | — | Used by MCP test harness only. |

If you find an env var in code that isn't listed here, grep for `os.getenv` / `os.environ` in `api/` and `mcp/` — the code is the canonical source.

## How environment variables flow on each path

### Render
- The Blueprint ([render.yaml](../../render.yaml)) declares each var per service, marks some as `generateValue: true` (random secrets), and wires `fromService` references where two services need the same value (e.g. `OAUTH_HANDOFF_SECRET` must be identical on api and mcp).
- You change values in the Render dashboard → Render restarts the service.

### `install.sh` / `docker-compose`
- Values come from `.env` at the repo root.
- `install.sh` writes `.env` based on flags, port-probe results, and minted secrets. Re-running the installer respects pre-existing values for `OAUTH_HANDOFF_SECRET` and `BRILLIANT_SERVICE_API_KEY`.
- After editing `.env`: `docker compose down && docker compose up -d`.

## Storage backend selection

`STORAGE_BACKEND` chooses where attachment blobs live.

- **`local`** (default) — files written under `LOCAL_STORAGE_ROOT` (default `/data/uploads`). The persistent disk on Render is mounted there. Download URLs are HMAC-signed by `LOCAL_STORAGE_SIGNING_KEY`.
- **`s3`** — any S3-compatible backend (AWS S3, Cloudflare R2, Backblaze B2, MinIO). Set the standard S3 env vars (endpoint, region, bucket, access key, secret) and the api will write blobs there with content-hash dedup.

Switch backends by changing `STORAGE_BACKEND` and restarting. Existing blobs do **not** automatically migrate — plan a migration window if you have meaningful data already stored locally. See [10-attachments-and-storage.md](10-attachments-and-storage.md) and [docs/ATTACHMENTS.md](../ATTACHMENTS.md).

## Tier 3 AI reviewer

Set `ANTHROPIC_API_KEY` to enable Tier 3 AI evaluation on the staging pipeline:

- The reviewer uses `claude-sonnet-4-6` with a 1024-token cap.
- Confidence floor: any AI verdict below `0.7` is overridden to `escalate` (Tier 4).
- The reviewer **fails safe**: missing key, API errors, malformed responses → `escalate`. Setting the key wrong is not dangerous; it just stops Tier 3 items from auto-resolving.
- Disable by unsetting the variable and restarting. Pending Tier 3 items will sit in `pending` status until cleared by a human via `review_staging` or by `process_staging`.

## Port-probe behavior

`install.sh` probes 5442 / 8010 / 8011 on the host. If any port is occupied:

- The probe steps up by `+10` and retries (`5442 → 5452 → 5462 …`).
- After 5 unsuccessful attempts on a port, the installer aborts with an error.
- The chosen ports are written into `.env` and embedded in the URLs printed at the end of install.

Override directly by exporting `BRILLIANT_DB_PORT`, `BRILLIANT_API_PORT`, or `BRILLIANT_MCP_PORT` before running the installer.

## Changing config safely

Most variables can be changed without data loss; restart the affected service after editing `.env` (or after saving in the Render dashboard).

**Variables to be careful with:**

- `OAUTH_HANDOFF_SECRET` — invalidates any in-flight OAuth login. Rotate during a quiet window.
- `BRILLIANT_SERVICE_API_KEY` — invalidates the MCP's connection to the api. Rotate this on both services together.
- `LOCAL_STORAGE_SIGNING_KEY` — invalidates all currently-issued signed download URLs. Existing blobs remain on disk.
- `DATABASE_URL` — pointing at a different database on a running stack will at minimum confuse migrations. Don't.

## See also

- [03-installation.md](03-installation.md) — where these variables get set initially.
- [10-attachments-and-storage.md](10-attachments-and-storage.md) — full storage-backend story.
- [12-security.md](12-security.md) — key rotation and OAuth secret handling.
