# 05 — Connecting Clients

> Wire Claude Co-work, Claude Desktop, Claude Code, and direct REST clients to your Brilliant deployment.

**Who this is for:** the operator after the stack is running and `/setup` is complete.

You should already have your six-field credentials block (admin email, API key, OAuth `client_id`, OAuth `client_secret`, MCP connector URL, login URL). If not, fetch it via `/auth/login` (rotates the key) or `GET /credentials` with your existing admin key.

---

## Path 1 — Claude Co-work (custom connector + OAuth)

The polished, Anthropic-cloud path. Requires the MCP to be reachable over public HTTPS.

### Steps

1. In Claude Co-work, open organization settings → custom connectors → add new.
2. Paste the four fields from your credentials block:
   - **Name** — anything (e.g. "Brilliant").
   - **MCP URL** — the connector URL from credentials (e.g. `https://brilliant-mcp-xxxx.onrender.com`).
   - **Client ID** — OAuth `client_id`.
   - **Client secret** — OAuth `client_secret`.
3. Save. Claude opens a browser tab to your api's `/oauth/login`.
4. Sign in with the admin email + password you set at `/setup`.
5. Claude flashes "connected." From this moment, every MCP tool call from this user is scoped to their RLS context (per-user reads, governance enforced for writes).

### What happens under the hood (3-gate auth)

Three independent gates protect the KB:

1. **Pre-registered OAuth client** — DCR is disabled, so an attacker who discovers the MCP URL can't self-register. Both `client_id` and `client_secret` must already exist in the database.
2. **User login** — MCP's `/authorize` redirects to the api's `/oauth/login`. The redirect back to the MCP carries an HMAC-SHA256 signature using `OAUTH_HANDOFF_SECRET`. Tampering breaks the handoff.
3. **Per-user RLS via `X-Act-As-User`** — the MCP authenticates upstream with a service-role key. The header is honored only from service keys; Postgres RLS enforces per-user scope on every query.

If any gate is misconfigured, login fails closed. See [12-security.md](12-security.md) for the full story.

### Troubleshooting

- **Modal rejects the URL** → must be HTTPS and reachable from Anthropic's cloud. `localhost`, private LAN IPs, and self-signed certs are not accepted. See [13-troubleshooting.md](13-troubleshooting.md).
- **Login succeeds in the browser but Claude shows disconnected** → likely an `OAUTH_HANDOFF_SECRET` mismatch between api and mcp, or the api's external URL doesn't match what the MCP expects.
- **Tools work but writes get rejected** → that user's role doesn't permit direct writes, so writes are routed through staging. Expected for non-admin/editor roles. See [07-governance-pipeline.md](07-governance-pipeline.md).

### Adding the skill bundle

The repo ships a Co-work skill at `skill/brilliant-kb-assistant.zip`. Co-work users install it as a personal skill; Claude then knows the workflow conventions (session start, governance inbox, daily notes, LOD-first browsing).

The skill carries a `skill_version` (currently `0.9.0`) and on every fresh session calls `get_version` against your api. Three outcomes:

- **Skill ≥ latest** → proceed silently.
- **min ≤ skill < latest** → one-line "newer skill available" banner, then continue.
- **Skill < min** → refuses to do anything and tells the user to update.

If you upgrade the api to a version that bumps `min_skill_version`, Co-work users with older skill installs will see the refusal banner. Push the new bundle (or have them re-download from your `/setup`'s `skill_download_url`).

---

## Path 2 — Claude Desktop (stdio MCP via `mcp-remote` bridge)

Claude Desktop talks stdio. To bridge it to a remote MCP, use the `mcp-remote` shim. To bridge it to a **local** stdio MCP, point straight at `mcp/server.py`.

### Local stdio (laptop install)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your platform:

```json
{
  "mcpServers": {
    "brilliant": {
      "command": "python",
      "args": ["/absolute/path/to/xireactor-brilliant/mcp/server.py"],
      "env": {
        "BRILLIANT_API_PUBLIC_URL": "http://localhost:8010",
        "BRILLIANT_SERVICE_API_KEY": "<your service key>"
      }
    }
  }
}
```

Restart Claude Desktop. The brilliant tools appear in the tool picker.

The installer's headless-with-admin path also writes a ready-to-paste `claude-desktop-snippet.json` next to `install.sh`. Use that as a starting point.

### Remote bridge (Co-work-style on Desktop)

Use [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) — see [mcp/README.md](../../mcp/README.md). Briefly:

```json
{
  "mcpServers": {
    "brilliant": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<your-mcp-host>/mcp",
        "--client-id", "<oauth client_id>",
        "--client-secret", "<oauth client_secret>"
      ]
    }
  }
}
```

The OAuth flow opens in a browser tab on first connect.

---

## Path 3 — Claude Code

Claude Code consumes MCP via its own configuration mechanism (CLI command or per-project settings). The pattern is identical to Claude Desktop's stdio config: point `command` and `args` at `mcp/server.py`, supply `BRILLIANT_API_PUBLIC_URL` and `BRILLIANT_SERVICE_API_KEY` in `env`.

See [skill/SKILL.md](../../skill/SKILL.md) for the skill author's view of the same flow.

---

## Path 4 — Direct REST

For scripts, integrations, and admin tooling that don't go through MCP.

### Authentication

Every request carries a Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_API_KEY" \
  https://your-api-host/entries
```

Token validation:
1. The api looks up the key by its 9-character prefix (`bkai_xxxx`).
2. bcrypt-verifies the full token against `api_keys.key_hash`.
3. Joins to `users` for role, department, org_id.
4. Sets the appropriate Postgres role and session vars before running your query.

### Common calls

```bash
# List entries (RLS-scoped)
curl -H "Authorization: Bearer $KEY" https://your-api-host/entries

# Create an entry (interactive/api keys only — agent keys go through staging)
curl -X POST https://your-api-host/entries \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Note","content":"# Hello","content_type":"resource","logical_path":"Resources/test"}'

# Search
curl -H "Authorization: Bearer $KEY" \
  "https://your-api-host/entries?search=onboarding&limit=10"

# Submit a change through staging (agent keys must use this)
curl -X POST https://your-api-host/staging \
  -H "Authorization: Bearer $AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"change_type":"create","target":{...}}'
```

### OpenAPI

The full schema is auto-generated and served at `https://<your-api-host>/docs` (Swagger UI). Use that as the canonical endpoint reference; this guide does not duplicate it.

### Three key types — different write paths

The Bearer key's `key_type` determines whether you can write directly:

| key_type | source label | Direct writes? | Notes |
|---|---|---|---|
| `interactive` | `web_ui` | Yes (subject to RLS) | Issued from `/setup` and `/auth/login`. |
| `agent` | `agent` | **No** — must use `submit_staging` | Issued for agent-side use. RLS forbids direct writes to `entries`. |
| `api_integration` | `api` | Yes (subject to RLS) | Issued for service integrations (CI, ops scripts). |

See [06-user-and-permission-management.md](06-user-and-permission-management.md) for issuance and rotation.

---

## Verifying the connection

Whichever path you wired, the simplest verification is:

```
session_init
```

In Co-work / Desktop / Code, ask Claude to call `session_init`. The response carries:

- `manifest.user.display_name` — should be **you**, not the service account
- `manifest.user.role` — should match the role you provisioned
- `manifest.user.source` — `web_ui` (you), `agent`, or `api`
- `manifest.total_entries` — sanity-check matches your KB size

If `display_name` is the service account, the `X-Act-As-User` header isn't being applied — the Co-work OAuth handoff probably failed silently. Check the api logs.

## See also

- [06-user-and-permission-management.md](06-user-and-permission-management.md) — invite users, assign roles, rotate keys.
- [07-governance-pipeline.md](07-governance-pipeline.md) — what happens when an agent tries to write.
- [13-troubleshooting.md](13-troubleshooting.md) — connector failures, common misconfigs.
