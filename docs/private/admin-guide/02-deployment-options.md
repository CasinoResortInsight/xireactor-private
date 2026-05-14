# 02 — Deployment Options

> Pick a deployment shape before you install. The trade-offs are real.

**Who this is for:** anyone deciding *where* to run Brilliant.

## Decision matrix

| Path | Time to live | Public HTTPS? | Cost | Best for |
|---|---|---|---|---|
| **Render Blueprint** | ~3 min | Yes (managed) | ~$20–25/mo | Teams that want Co-work to "just work." Recommended starting point. |
| **install.sh on a VPS** | ~5 min | You provide TLS | Cost of the VM | Teams that want self-hosted control with one-shot setup. |
| **install.sh on a laptop** | ~5 min | No (localhost) | Free | Solo evaluation / Claude Desktop / Claude Code only. Co-work won't connect to localhost. |
| **docker-compose** (manual) | ~10 min | You provide TLS | Cost of the host | Audited installs, custom images, dev work. |
| **Manual Docker** | Variable | You provide TLS | Cost of the host | You want to inspect and run each step yourself. |

There is **no first-class Kubernetes / Helm story yet** — the project ships dev-flavored Docker Compose and a Render Blueprint. A polished `docker-compose.prod.yml` is on the roadmap (see [README.md:271](../../README.md)).

## When you need a public HTTPS URL

**Claude Co-work's custom-connector modal rejects `localhost` URLs.** Anthropic's cloud must be able to reach the MCP endpoint over HTTPS. So:

- If you need Co-work, you need a public HTTPS host. Render gives you this for free; on a VPS you bring your own (Caddy, nginx, Cloudflare Tunnel, ngrok, etc.).
- If you only need Claude Desktop or Claude Code, **localhost is fine** — those clients connect via local stdio MCP and never touch the network.

For tunneling a local install into Co-work, ngrok and `cloudflared` both work. See [README.md:97](../../README.md) for the project's note.

## Prerequisites by path

### Render Blueprint
- A Render account.
- An admin email address (the only field Render asks for at deploy time).
- Optional: an Anthropic API key if you want the Tier 3 AI reviewer (see [07-governance-pipeline.md](07-governance-pipeline.md)).

### `install.sh` (Mac / Linux)
- `curl` (the only hard dependency).
- Docker — auto-installed by the script unless you pass `--no-install-docker`.
- Free TCP ports 5442, 8010, 8011 (auto-probed; the installer steps up by 10 if any are taken, up to 5 attempts).
- For headless / VPS: SSH access plus the ability to tunnel one port back to your workstation, **or** a public HTTPS reverse proxy.

### docker-compose (manual)
- Docker 20.10+ and Docker Compose v2.
- A `.env` file (copy from `.env.sample`) with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `POSTGRES_PASSWORD`. Optional: `ANTHROPIC_API_KEY`, `ADMIN_API_KEY`.

## Resource sizing

The Render Blueprint provisions:

- `brilliant-api` — Render **Starter** instance (~512 MB RAM)
- `brilliant-mcp` — Render **Starter** instance
- Managed Postgres — **Basic-256mb** plan
- 1 GB persistent disk attached to the api service at `/data`

This is enough for a small team and a few thousand entries. Scaling guidance:

- **Database**: Postgres is the limiting factor. A KB of ~50K entries with full-text + embeddings is comfortable on a 1 GB Postgres plan; jump to a higher tier before then if you import a vault that large.
- **API and MCP services**: stateless. Vertical-scale until ~100 concurrent agent sessions; the upstream stress-test numbers (flat ~178 ops/s at 20–120 concurrent writers, 99.8%+ success — see [ARCHITECTURE.md](../../ARCHITECTURE.md#concurrency-results)) suggest a single Starter is plenty for most teams.
- **Disk for attachments**: 1 GB fills fast if you ingest PDFs aggressively. Either bump the Render disk size or switch to S3 (see [10-attachments-and-storage.md](10-attachments-and-storage.md)).

For a self-hosted VPS, **2 vCPU / 4 GB RAM / 20 GB disk** is a comfortable starting point for ≤10 users and ≤10K entries.

## Anti-patterns

- **Don't run the demo seed keys (`bkai_*_testkey_*`) in production.** They're for local evaluation only. Rotate immediately if any deployment beyond your laptop ever sees them.
- **Don't expose the API directly without TLS.** Bearer tokens in cleartext over HTTP is a credential leak waiting to happen. Render handles TLS for you; on self-host, put a reverse proxy in front.
- **Don't try to share a Render free-tier Postgres.** It deletes after 30 days, has no persistent disks for attachments, and idle spin-down breaks MCP. Use a paid plan or self-host.
- **Don't run two API instances against the same Postgres without thought.** The schema supports it (RLS is per-connection, set via `SET LOCAL`), but you'll want a load balancer that doesn't break the OAuth handoff (HMAC-signed redirect from MCP to API).

## See also

- [03-installation.md](03-installation.md) — step-by-step for whichever path you picked.
- [04-configuration.md](04-configuration.md) — env vars and ports for each path.
- [12-security.md](12-security.md) — TLS, key rotation, OAuth gates.
