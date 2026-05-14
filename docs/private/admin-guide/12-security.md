# 12 — Security

> What you must understand to run Brilliant safely.

**Who this is for:** the admin responsible for the deployment's security posture.

For the project's threat model and disclosure policy, see [SECURITY.md](../../SECURITY.md). This page is the operator's working reference.

## The three independent gates (Co-work / remote MCP)

Three gates protect the KB. Breaking any one does not grant access:

1. **Pre-registered OAuth client.** Dynamic Client Registration is **disabled** on the remote MCP. An attacker who discovers the MCP URL cannot self-register. They need the `client_id` + `client_secret` from your `/setup` credentials block.
2. **User login at `/oauth/login`.** The MCP redirects to the api's login page. The redirect back to the MCP is HMAC-SHA256 signed with `OAUTH_HANDOFF_SECRET`. Tampering invalidates the handoff. The secret must be identical on both services.
3. **Per-user RLS via `X-Act-As-User`.** The MCP authenticates upstream with a service-role key. The header is honored *only* from service keys (other key types ignore it). Postgres RLS enforces the per-user scope on every query. Access logs record the acting user, not the service account.

If any gate is misconfigured, login fails closed.

## Row-Level Security

RLS is the **primary** isolation mechanism. App-level filtering is treated as defense-in-depth, never as a primary line.

Properties:

- Every data table has RLS `ENABLE` and `FORCE` (even table owners are subject to it).
- Tenant isolation: every policy includes `org_id = current_setting('app.org_id')`.
- The api sets four session vars at connection time via `SET LOCAL`: `app.user_id`, `app.org_id`, `app.role`, `app.department`. Then `SET LOCAL ROLE` to one of `kb_admin` / `kb_editor` / `kb_commenter` / `kb_viewer` / `kb_agent`.
- `SET LOCAL` is critical: the role/vars are scoped to the current transaction, preventing pooled-connection poisoning.

### Why this matters operationally

You **cannot** bypass RLS from app code or by holding a "more privileged" key. Even an admin key sets the `kb_admin` role + the admin's `app.user_id` — Postgres still applies the admin policy. The only way to read across tenants is direct DB access (which is why protecting `DATABASE_URL` and the Postgres password is so important).

### Permissions v2

The unified `permissions` table layers grants on top of the org role:

- Polymorphic principal: `user` or `group`.
- Resource: a single entry, or a path prefix.
- Group membership resolved server-side; granting `group:engineering` propagates to every member.
- Grants are **additive**. They never restrict beyond the role's sensitivity ceiling.

## Sensitivity tiers and the ceiling

Each entry has a `sensitivity_level`. Roles have implicit ceilings:

- `viewer` — cannot read `private`, `system`, or `strategic` content even with a grant.
- `commenter` — similar restrictions, can comment on what they can read.
- `editor` — can read and write up to `non-sensitive`, `internal`. Updates on `system` / `strategic` content escalate to Tier 3.
- `admin` — no ceiling.

A grant cannot lift a viewer above their ceiling. It can only widen access *within* the ceiling — e.g. give a commenter access to a specific path they wouldn't otherwise see.

## Key handling

| Key | What it is | Rotation impact |
|---|---|---|
| **`ADMIN_API_KEY`** | The bootstrap admin's API key (env-pinned or auto-generated). | Restart api after change. Old key dies; admins re-key. |
| **User interactive keys** | Issued by `/setup` and `/auth/login`. | Self-rotate by signing in again. Old key invalidated. |
| **`BRILLIANT_SERVICE_API_KEY`** | The MCP's upstream key to the api. | Must be rotated on **both** services together. Otherwise MCP can't reach api. |
| **OAuth `client_secret`** | The Co-work connector's secret. | Rotate via `/auth/login` checkbox. Every Co-work user must re-add the connector after rotation. |
| **`OAUTH_HANDOFF_SECRET`** | HMAC key for MCP↔api login redirect. | Must be identical on both services. In-flight logins fail until both are updated. |
| **`LOCAL_STORAGE_SIGNING_KEY`** | HMAC key for signed download URLs. | Existing signed URLs break. Issued URLs are short-lived; rotate during a quiet window. |
| **`POSTGRES_PASSWORD`** | DB superuser password. | Change in DB + env atomically. App downtime during the swap. |

### When to rotate

- **On suspected leak** — rotate `/auth/login` checkbox covers admin API key + OAuth client secret in one action.
- **On a compromised user laptop** — that user signs in again; old key dies.
- **Quarterly** — at minimum for `BRILLIANT_SERVICE_API_KEY`, OAuth secret, `OAUTH_HANDOFF_SECRET`. Pick a quiet window.

### Don't do this

- Don't email keys around. The six-field credentials block is designed to be downloaded once and stored in a password manager.
- Don't bake keys into images. Use env vars (and on Render, the dashboard's secret-value flag).
- Don't share a single API key across multiple agents. Issue per-agent keys with `key_type=agent` so writes route through staging individually.

## TLS

The project ships dev-flavored Docker Compose **without TLS termination**. For production:

- **Render path** — TLS is handled by Render's load balancer. Nothing to configure.
- **Self-host** — put a reverse proxy (Caddy, nginx, Traefik) in front of the api and mcp services. Caddy auto-provisions certs from Let's Encrypt with one config line. The api and mcp can stay on plain HTTP behind the proxy.

Bearer tokens over plain HTTP is a credential leak. Never expose the api directly to the internet.

## Audit log

`audit_log` is append-only and writeable only by the admin DB role. Useful queries:

```sql
-- All admin-equivalent actions in the last day
SELECT created_at, actor_user_id, action, resource_type, resource_id
FROM audit_log
WHERE created_at > now() - interval '1 day'
  AND action IN ('staging_approve','staging_reject','permission_grant','permission_revoke','user_create')
ORDER BY created_at DESC;

-- Failed logins (if logged via request_log)
SELECT created_at, actor_user_id, path, status
FROM request_log
WHERE path = '/auth/login' AND status >= 400
ORDER BY created_at DESC LIMIT 50;

-- Group changes
SELECT * FROM audit_log WHERE action LIKE 'group_%' ORDER BY created_at DESC LIMIT 50;
```

Tail this when you suspect something. The audit table is the single ground-truth for who-did-what.

## The seeded demo keys

The `--seed-demo` flag inserts `bkai_*_testkey_*` keys. **They're public** — they're visible in the repo and in `tests/demo_e2e.sh`. Any deployment beyond your laptop must revoke them:

```sql
DELETE FROM api_keys WHERE key_prefix IN ('bkai_adm1','bkai_edit','bkai_view','bkai_agnt');
```

## Backups as a security tool

A 30-second restore from yesterday's dump is your last line of defense against a destructive insider, a botched migration, or a ransomware wipe of the disk volume. See [11-observability-and-ops.md](11-observability-and-ops.md) for the backup/restore playbook.

## See also

- [SECURITY.md](../../SECURITY.md) — disclosure process and threat model.
- [06-user-and-permission-management.md](06-user-and-permission-management.md) — roles, grants, key types.
- [11-observability-and-ops.md](11-observability-and-ops.md) — auditing in practice.
