# 03 — Installation

> Three concrete paths, each end-to-end. Pick one based on [02-deployment-options.md](02-deployment-options.md).

**Who this is for:** the operator running the install.

---

## Path A — Render Blueprint (recommended for Co-work users)

The fastest, most production-leaning path. Render reads [render.yaml](../../render.yaml) and provisions everything in one click.

### Steps

1. **Click the Deploy button** in [README.md](../../README.md). Render asks for one input: `ADMIN_EMAIL`.
2. **Wait ~3 minutes.** Render builds the api and mcp Docker images, provisions the managed Postgres, runs the migrations via `preDeployCommand`, and boots all three services.
3. **Visit the api service URL** that Render shows you. The root route redirects to `/setup` because the first-run latch is unset.
4. **Choose a password** at `/setup`. On submit, the credentials page appears with **six fields**:
   - admin email
   - API key (`bkai_…`)
   - OAuth `client_id`
   - OAuth `client_secret`
   - MCP connector URL (the public URL of the mcp service)
   - login URL
   Each has a copy button. The page also offers a `brilliant-credentials.txt` download — **take it**. After you leave this page, `/setup` returns 404 forever.
5. **Save those credentials somewhere safe** (a password manager). The OAuth secret cannot be recovered without rotating it.
6. **Smoke test:**
   ```bash
   curl https://<your-api-host>/health
   ```
   You should see `{"status":"ok",...}`.

That's it — proceed to [05-connecting-clients.md](05-connecting-clients.md) to wire up Co-work.

### If you lose your API key

`https://<your-api-host>/auth/login` lets you re-authenticate with email + password and **rotate to a fresh API key**. All prior keys are invalidated. Optionally also rotate the OAuth client secret atomically with a checkbox on the same page.

---

## Path B — `install.sh` on Mac or Linux

For self-hosted boxes (laptops, VPS, dev machines).

### One-liner (interactive, opens browser)

```bash
curl -fsSL https://raw.githubusercontent.com/thejeremyhodge/xireactor-brilliant/main/install.sh \
  | bash
```

If you're not already inside a clone, the script self-clones the latest release tag into `./xireactor-brilliant` and runs from there.

### Pre-cloned (audit before running)

```bash
git clone https://github.com/thejeremyhodge/xireactor-brilliant.git
cd xireactor-brilliant
./install.sh --dry-run   # preview the plan
./install.sh             # actually run
```

### What the installer does

The script ([install.sh](../../install.sh)) runs through eight phases (you'll see them logged). Roughly:

1. **Preflight** — checks `curl`, OS, available disk.
2. **Docker** — installs Docker if missing (skip with `--no-install-docker`).
3. **Port probe** — tests ports 5442 / 8010 / 8011, steps up by 10 if occupied (max 5 tries), then errors.
4. **Randoms** — mints `OAUTH_HANDOFF_SECRET` and `BRILLIANT_SERVICE_API_KEY` if not preset.
5. **Env file** — writes `.env` with chosen ports, secrets, and any flag overrides.
6. **Compose up** — `docker compose up -d` (or equivalent).
7. **Health poll** — waits up to 60s for `/health` to return `200`.
8. **Browser open** — opens `/setup` in your default browser, or prints the URL on `--headless`.

### Useful flags

| Flag | Effect |
|---|---|
| `--ref <tag\|branch>` | Pin to a specific git ref (otherwise: latest release tag). |
| `--dir <path>` | Clone into a custom directory. |
| `--headless` | Don't try to open a browser; print the URL. |
| `--admin-email you@example.com` | Pre-fill admin email; prompts twice for password on a TTY. |
| `--admin-password '...'` | CI-only, **password is visible in `ps`**. |
| `--seed-demo` | Insert seeded demo entries and demo API keys (`bkai_*_testkey_*`). For evaluation only. |
| `--no-install-docker` | Don't auto-install Docker; fail if missing. |
| `--dry-run` | Show the plan, change nothing. |
| `--help` | Print all flags. |

### Headless on a VPS

If the box has no browser, run with `--headless` and SSH-tunnel back:

```bash
./install.sh --headless
# on your workstation:
ssh -L 8010:localhost:8010 user@your-vps
# then visit http://localhost:8010/setup in your local browser
```

For full unattended setup (CI), pass `--admin-email` and either let it prompt on TTY, or pass `--admin-password`. After admin bootstrap completes, the installer auto-fetches `brilliant-credentials.txt` via `GET /credentials`.

### Recovering a lost credentials file

```bash
curl -H 'Authorization: Bearer YOUR_ADMIN_API_KEY' \
  http://localhost:8010/credentials > brilliant-credentials.txt
```

---

## Path C — `docker-compose` manual

Inspect and run each step yourself.

```bash
git clone https://github.com/thejeremyhodge/xireactor-brilliant.git
cd xireactor-brilliant
cp .env.sample .env
# Edit .env and set at minimum:
#   ADMIN_EMAIL
#   ADMIN_PASSWORD
#   POSTGRES_PASSWORD
# Optional:
#   ANTHROPIC_API_KEY    -- enables Tier 3 AI reviewer
#   ADMIN_API_KEY        -- pin the admin key (otherwise auto-generated and logged)
docker compose up -d
curl http://localhost:8010/health
```

If you didn't set `ADMIN_API_KEY`, the auto-generated value is printed once to the api logs:

```bash
docker compose logs api | grep -A 3 "AUTO-GENERATED ADMIN API KEY"
```

If you missed it, mint a fresh session key:

```bash
curl -X POST http://localhost:8010/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"…"}'
```

The response body is `{api_key, user}`. Use the `api_key` value as the Bearer token.

The full compose graph (services, volumes, env wiring) lives in [docker-compose.yml](../../docker-compose.yml). The two image targets are `api/Dockerfile` and `mcp/Dockerfile`.

---

## The `/setup` ceremony (all paths)

`/setup` is the **single first-run web ceremony**. On every fresh install:

1. The first-run latch in the database (migration [027_first_run_flag.sql](../../db/migrations/027_first_run_flag.sql)) is `false`. The root route redirects to `/setup` and only `/setup` responds; all other routes 404.
2. You submit your password.
3. The server creates the admin user, mints the API key and the OAuth client, flips the latch to `true`.
4. The credentials page renders with six fields (admin email, API key, OAuth client_id, OAuth client_secret, MCP connector URL, login URL). Copy buttons. Download.
5. `/setup` 404s from this point on.

If you need to re-fetch the credentials, use `/auth/login` (rotates the key) or `GET /credentials` with the existing admin API key.

---

## Smoke test

After install, run the project's end-to-end test against your deployment. From the repo root:

```bash
bash tests/demo_e2e.sh
```

This walks through health, auth, CRUD, governance, vault import, and search. It exits non-zero on any failure.

The script defaults to `http://localhost:8010`. To target a different host:

```bash
API_BASE_URL=https://your-api-host bash tests/demo_e2e.sh
```

You'll need the seeded demo keys (`bkai_adm1_testkey_admin`, `bkai_edit_testkey_editor`, `bkai_view_testkey_viewer`, `bkai_agnt_testkey_agent`) for the script to succeed. Either install with `--seed-demo`, or read [tests/demo_e2e.sh](../../tests/demo_e2e.sh) and adapt to your real keys.

---

## After install — what next

1. Save your credentials.
2. **Rotate or revoke the seeded demo keys** (they exist if you used `--seed-demo`). Hit `/auth/login` and rotate the admin key. See [12-security.md](12-security.md).
3. Wire up at least one Claude client. See [05-connecting-clients.md](05-connecting-clients.md).
4. Import existing content. See [09-importing-content.md](09-importing-content.md).
5. Invite teammates. See [06-user-and-permission-management.md](06-user-and-permission-management.md).

## See also

- [02-deployment-options.md](02-deployment-options.md) — context on which path to pick.
- [04-configuration.md](04-configuration.md) — env vars referenced above.
- [13-troubleshooting.md](13-troubleshooting.md) — when something doesn't come up cleanly.
