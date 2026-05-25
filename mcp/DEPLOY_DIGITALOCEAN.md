# Deploying Brilliant on DigitalOcean (Droplet + Managed Postgres + Caddy)

End-to-end recipe for hosting the Brilliant API and remote MCP server on a single
DigitalOcean Droplet with a DigitalOcean Managed Postgres database, fronted by
Caddy for automatic HTTPS on custom subdomains under `argusslabs.com`.


---

## What you'll end up with

```
                          Internet
                             │ :443 (HTTPS, Let's Encrypt via Caddy)
                             ▼
               ┌──────────────────────────┐
               │  Caddy (on the Droplet)  │  auto-TLS, reverse proxy
               └────────┬─────────────────┘
       ihc-api.argusslabs.com │ ihc-mcp.argusslabs.com
                             ▼
               ┌──────────────────────────┐
               │  docker compose          │
               │   ├─ brilliant-api :8000 │
               │   └─ brilliant-mcp :8001 │
               └────────┬─────────────────┘
                        │ TLS (DO private VPC)
                        ▼
               ┌──────────────────────────┐
               │  DO Managed Postgres 16  │  pgvector extension enabled
               └──────────────────────────┘
```

The MCP endpoint Claude / clients connect to: **`https://ihc-mcp.argusslabs.com`**

---

## Cost estimate (USD, 2026)

| Component                            | Spec                          | ~$/mo |
|--------------------------------------|-------------------------------|------:|
| Droplet (Basic Regular)              | 2 vCPU / 4 GB RAM / 80 GB SSD |  $24  |
| Managed Postgres (Basic)             | 1 vCPU / 1 GB RAM / 10 GB     |  $15  |
| Spaces (optional, for off-box backups)| 250 GB                       |   $5  |
| **Total**                            |                               | **~$44** |

You can start on the $12 Droplet (1 vCPU / 2 GB) but expect tight memory once
both Python services + Caddy are up. Resize later — DO supports in-place.

---

## Prerequisites

- A DigitalOcean account with billing set up.
- DNS control for `argusslabs.com`. This guide assumes you either:
  - delegate the zone to DO's nameservers (cleanest), **or**
  - keep DNS at your current registrar and add two A records there.
- `git` and SSH on your local machine.
- The xireactor-private repo accessible from the Droplet (clone via HTTPS with a
  GitHub PAT, or add the Droplet's SSH key as a deploy key).

---

## Step 1 — Create the Managed Postgres cluster

1. DO Control Panel → **Databases → Create Database Cluster**.
2. Engine: **PostgreSQL 16**.
3. Plan: **Basic, 1 GB RAM / 1 vCPU / 10 GB** (smallest tier).
4. Datacenter: pick one — **NYC3** or **SFO3** are good US defaults. Whichever
   you choose, use the **same region for the Droplet** so they share a VPC.
5. VPC Network: **default-<region>** (or create one). Both DB and Droplet must
   land in this VPC.
6. Name: `brilliant-db`.
7. Click **Create Database Cluster**. Provisioning takes ~5 minutes.

While it provisions:

- Under **Users & Databases**, create a database called `brilliant` and a user
  called `brilliant_app`. Copy the generated password — you'll need it.
- Under **Settings → Trusted Sources**, plan to add the Droplet once it exists
  (Step 2). Until then the DB only accepts traffic from inside the VPC.

### Enable pgvector

Once the cluster is up, open **Connection Details → Flags & Configuration**
(or connect with `psql`) and run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

DO Managed Postgres 16 ships pgvector — no support ticket required.

### Capture the connection string

Connection Details → "Connection string" with **SSL mode: require**. It looks
like:

```
postgresql://brilliant_app:<password>@brilliant-db-do-user-XXXX-0.k.db.ondigitalocean.com:25060/brilliant?sslmode=require
```

Save this — it becomes `DATABASE_URL`.

> The app's existing migrations expect to be applied by a role with CREATE
> privileges on the database. The `brilliant_app` user owns the DB it created,
> so this is fine. If you instead use the cluster's `doadmin` superuser, that
> also works; just be aware migrations will run as superuser.

---

## Step 2 — Create the Droplet

1. **Create → Droplets.**
2. Region: **same as the Postgres cluster.**
3. Image: **Ubuntu 24.04 (LTS) x64**.
4. Size: **Basic → Regular → $24/mo (2 vCPU, 4 GB RAM, 80 GB SSD)**.
5. VPC: **same VPC as the DB cluster.**
6. Authentication: **SSH key** (paste your public key).
7. Hostname: `brilliant-prod`.
8. Add the **Backups** add-on ($4.80/mo) if you want weekly Droplet snapshots.
9. Create.

When it's ready, copy the Droplet's **public IPv4** address. Then:

- DO → **Databases → brilliant-db → Settings → Trusted Sources → Add** → select
  the Droplet. This is the firewall allowlist; the DB still requires the
  password, but only Droplets you list can even attempt to connect.

### Lock the Droplet down

SSH in (`ssh root@<droplet-ip>`) and:

```bash
# Create a non-root user
adduser brilliant
usermod -aG sudo brilliant
rsync --archive --chown=brilliant:brilliant ~/.ssh /home/brilliant

# Basic firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Disable root SSH + password auth
sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

From now on: `ssh brilliant@<droplet-ip>`.

---

## Step 3 — DNS

Decide on one of two paths.

### Path A — Delegate `argusslabs.com` to DigitalOcean (recommended)

1. At your registrar, change the nameservers for `argusslabs.com` to:
   - `ns1.digitalocean.com`
   - `ns2.digitalocean.com`
   - `ns3.digitalocean.com`
2. In DO: **Networking → Domains → Add Domain** → `argusslabs.com`.
3. Add records:

| Type | Hostname    | Value                  | TTL |
|------|-------------|------------------------|-----|
| A    | `ihc-api`   | `<droplet-public-ipv4>`| 300 |
| A    | `ihc-mcp`   | `<droplet-public-ipv4>`| 300 |

### Path B — Keep DNS at your registrar

Add the same two A records at your current DNS provider. Wait for propagation:

```bash
dig +short ihc-api.argusslabs.com
dig +short ihc-mcp.argusslabs.com
# Both should return the Droplet's public IP.
```

Do not proceed to Caddy until DNS resolves — Let's Encrypt issuance will fail.

---

## Step 4 — Install Docker + Caddy on the Droplet

```bash
ssh brilliant@<droplet-ip>

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker   # or log out/in

# Caddy (official apt repo)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Verify Caddy is alive: `sudo systemctl status caddy`.

---

## Step 5 — Clone the repo and configure env

```bash
cd /home/brilliant
git clone https://github.com/<your-org>/xireactor-private.git
cd xireactor-private
```

Create `.env` (next to `docker-compose.yml`):

```bash
cat > .env <<'EOF'
# ---- Managed Postgres ----
# Paste the DO connection string. Note ?sslmode=require — DO enforces TLS.
DATABASE_URL=postgresql://brilliant_app:<DO_PASSWORD>@brilliant-db-do-user-XXXX-0.k.db.ondigitalocean.com:25060/brilliant?sslmode=require

# ---- Public URLs (used by /setup, OAuth redirects, and the MCP self-publish) ----
BRILLIANT_API_PUBLIC_URL=https://ihc-api.argusslabs.com
BRILLIANT_MCP_PUBLIC_URL=https://ihc-mcp.argusslabs.com
MCP_BASE_URL=https://ihc-mcp.argusslabs.com
API_BASE_URL=https://ihc-api.argusslabs.com

# ---- Admin bootstrap ----
ADMIN_EMAIL=ihc@argusslabs.com

# ---- Shared secrets (generate with: openssl rand -hex 32) ----
OAUTH_HANDOFF_SECRET=<paste 64 hex chars>
BRILLIANT_SERVICE_API_KEY=<paste 64 hex chars>

# ---- Optional: Tier 3 AI reviewer ----
ANTHROPIC_API_KEY=

# ---- Host ports (Caddy will proxy to these on 127.0.0.1) ----
BRILLIANT_API_PORT=8010
BRILLIANT_MCP_PORT=8011
EOF
chmod 600 .env
```

Generate the two secrets:

```bash
openssl rand -hex 32   # paste into OAUTH_HANDOFF_SECRET
openssl rand -hex 32   # paste into BRILLIANT_SERVICE_API_KEY
```

---

## Step 6 — Override docker-compose for prod

The repo's [docker-compose.yml](../docker-compose.yml) ships the local-dev `db`
service. On DO you don't want it — Managed Postgres replaces it. Create a prod
override that disables the db service and binds api/mcp to localhost only so
they're only reachable through Caddy:

```bash
cat > docker-compose.prod.yml <<'EOF'
services:
  db:
    # Managed Postgres replaces the local db container.
    # `profiles` keeps this service defined (so other services'
    # depends_on references stay valid) but excluded from `up`.
    profiles: ["disabled"]

  api:
    # Drop --reload, bind to localhost only — Caddy is the public entry.
    command: ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
    ports: !override
      - "127.0.0.1:${BRILLIANT_API_PORT:-8010}:8000"
    depends_on: !override []
    volumes: !override
      - ./data/uploads:/data/uploads
    environment:
      DATABASE_URL: ${DATABASE_URL}
      STORAGE_BACKEND: local
      LOCAL_STORAGE_ROOT: /data/uploads
      ADMIN_EMAIL: ${ADMIN_EMAIL}
      BRILLIANT_API_PUBLIC_URL: ${BRILLIANT_API_PUBLIC_URL}
      BRILLIANT_MCP_PUBLIC_URL: ${BRILLIANT_MCP_PUBLIC_URL}
      OAUTH_HANDOFF_SECRET: ${OAUTH_HANDOFF_SECRET}
      BRILLIANT_SERVICE_API_KEY: ${BRILLIANT_SERVICE_API_KEY}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}

  mcp:
    ports: !override
      - "127.0.0.1:${BRILLIANT_MCP_PORT:-8011}:8001"
    depends_on: !override []
    environment:
      DATABASE_URL: ${DATABASE_URL}
      BRILLIANT_BASE_URL: http://api:8000     # in-compose service name
      MCP_BASE_URL: ${MCP_BASE_URL}
      MCP_PORT: "8001"
      BRILLIANT_API_PUBLIC_URL: ${BRILLIANT_API_PUBLIC_URL}
      BRILLIANT_MCP_PUBLIC_URL: ${BRILLIANT_MCP_PUBLIC_URL}
      OAUTH_HANDOFF_SECRET: ${OAUTH_HANDOFF_SECRET}
      BRILLIANT_SERVICE_API_KEY: ${BRILLIANT_SERVICE_API_KEY}
EOF

mkdir -p data/uploads
```

> Why `!override` on `ports`/`depends_on`/`volumes`: Compose merges lists by
> default (would *add* a public 8010 binding on top of the dev one). The
> `!override` tag tells Compose to replace instead of merge.

### Apply migrations against Managed Postgres

The repo's render path uses `tools/render_migrate.py`. Run it once from the
Droplet against the managed cluster:

```bash
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm api python tools/render_migrate.py
```

This applies `db/migrations/001..NNN` against the managed DB transactionally.
You'll re-run this each deploy (it's idempotent).

---

## Step 7 — Caddyfile

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
{
    email ihc@argusslabs.com
}

ihc-api.argusslabs.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8010 {
        header_up X-Forwarded-Proto https
        header_up X-Forwarded-Host  {host}
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options    "nosniff"
        Referrer-Policy           "strict-origin-when-cross-origin"
    }
}

ihc-mcp.argusslabs.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8011 {
        header_up X-Forwarded-Proto https
        header_up X-Forwarded-Host  {host}

        # MCP streaming / SSE — disable buffering, long timeouts.
        flush_interval -1
        transport http {
            read_timeout  10m
            write_timeout 10m
        }
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
}
EOF

sudo systemctl reload caddy
```

Caddy will request Let's Encrypt certs for both subdomains on the first inbound
request to each hostname. Watch the log if anything goes sideways:

```bash
sudo journalctl -u caddy -f
```

---

## Step 8 — Bring it up

```bash
cd /home/brilliant/xireactor-private
docker compose --env-file .env \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --build
```

Check:

```bash
docker compose ps
curl -I https://ihc-api.argusslabs.com/healthz
curl -I https://ihc-mcp.argusslabs.com/healthz
```

Both should return `200`.

---

## Step 9 — First-time admin setup

Open `https://ihc-api.argusslabs.com/setup` in a browser. The repo's setup flow
(see [api/routes/setup.py](../api/routes/setup.py)) will:

1. Prompt for an admin password (email is pre-filled from `ADMIN_EMAIL`).
2. Generate an API key and display it once.
3. Show the **MCP URL** to give to Claude — this will be:

   ```
   https://ihc-mcp.argusslabs.com
   ```

Configure Claude (or whichever MCP client) with that URL and the API key.

---

## Step 10 — Backups & ops

### Postgres backups
DO Managed Postgres includes daily automated backups with 7-day retention on
the Basic plan. For longer retention, schedule a logical dump to DO Spaces:

```bash
# /etc/cron.daily/brilliant-pgdump
#!/bin/bash
set -euo pipefail
TS=$(date +%F)
docker run --rm --env-file /home/brilliant/xireactor-private/.env \
  postgres:16 pg_dump "$DATABASE_URL" \
  | gzip > "/var/backups/brilliant-${TS}.sql.gz"
find /var/backups -name 'brilliant-*.sql.gz' -mtime +30 -delete
```

`chmod +x` it. Add `s3cmd`/`rclone` to ship to Spaces if you want off-box copies.

### Uploads disk
The `/data/uploads` directory holds attachment blobs. Snapshot the whole
Droplet via DO Backups (weekly) or rsync `data/uploads/` to Spaces nightly.

### Updates
```bash
cd /home/brilliant/xireactor-private
git pull
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm api python tools/render_migrate.py
docker compose --env-file .env -f docker-compose.yml -f docker-compose.prod.yml \
  up -d --build
```

### Logs
```bash
docker compose logs -f api
docker compose logs -f mcp
sudo journalctl -u caddy -f
```

---

## Troubleshooting

**Caddy can't get a cert.**
- DNS hasn't propagated. `dig +short ihc-mcp.argusslabs.com` must return the
  Droplet IP from your machine *and* from the Droplet itself.
- UFW is blocking 80. ACME HTTP-01 challenge needs port 80 open.
- You're using `ihc_mcp` (underscore). Won't work. See the note at the top.

**API can't reach Postgres.**
- Trusted Sources allowlist on the DB cluster doesn't include the Droplet.
- `?sslmode=require` missing from `DATABASE_URL` — DO rejects non-TLS.
- Droplet and DB are in different VPCs/regions — recreate one to match.

**MCP shows wrong URL on `/setup/done`.**
- `BRILLIANT_MCP_PUBLIC_URL` not in `.env`, or MCP container didn't reload.
  The MCP service writes its public URL into `brilliant_settings.mcp_public_url`
  at boot (see [remote_server.py](remote_server.py)). Restart it:
  `docker compose restart mcp`.

**OAuth handoff fails between services.**
- `OAUTH_HANDOFF_SECRET` differs between the two containers. Both read it from
  the same `.env` — confirm with:
  `docker compose exec api env | grep OAUTH_HANDOFF_SECRET`
  `docker compose exec mcp env | grep OAUTH_HANDOFF_SECRET`

**MCP streaming responses cut off after 30 s.**
- Caddy `read_timeout`/`write_timeout` too low. The Caddyfile above sets 10 m.

---

## Summary of endpoints

| Purpose         | URL                                       |
|-----------------|-------------------------------------------|
| Admin / setup   | `https://ihc-api.argusslabs.com/setup`    |
| API (public)    | `https://ihc-api.argusslabs.com`          |
| **MCP (client)**| **`https://ihc-mcp.argusslabs.com`**      |
| Postgres        | `*.k.db.ondigitalocean.com:25060` (VPC)   |
