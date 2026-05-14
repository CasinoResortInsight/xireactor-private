# 06 — User & Permission Management

> Inviting people, assigning roles, granting per-entry / per-path access, and rotating keys.

**Who this is for:** the admin onboarding teammates and operating the access model.

## The role model

Brilliant uses a Google Workspace-style role on every user, plus a granular permissions layer on top.

| Role | Read | Direct write | Submit to staging | Approve / reject staging |
|---|---|---|---|---|
| **admin** | All entries | All entries | Yes | Yes |
| **editor** | Shared + own department + owned | Shared + own department + owned | Yes | No |
| **commenter** | Shared + assigned | No (proposals only via staging) | Yes | No |
| **viewer** | Non-private, non-system | No | No | No |

A user has one role. Role is enforced in Postgres via `SET LOCAL ROLE` (one of `kb_admin`, `kb_editor`, `kb_commenter`, `kb_viewer`, `kb_agent`) plus RLS policies. You can't bypass it from app code.

## Inviting a new user

The flow is: admin creates an invite → admin shares the code + token → user redeems → user gets an API key.

### Generate the invite

As an admin, hit the api directly:

```bash
curl -X POST https://your-api-host/invitations \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "editor",
    "department": "engineering",
    "expires_in_hours": 72
  }'
```

Response includes `invite_code` (e.g. `CTX-XXXX-XXXX`) and a one-time `token`. **Both are needed for redemption** — the token is shown once, never again.

### Share with the user

Send them: invite code, token, the api host, and a short note about which Claude client they should use.

### User redeems

Two paths, depending on what they have:

- **From Claude (Co-work or Desktop with the brilliant skill):** they call the `redeem_invite` MCP tool with code, token, email, and display name. The tool returns a one-time API key.
- **From REST:** unauthenticated call to `POST /invitations/{code}/redeem` with token, email, password, display name.

### Critical invariant

> **Invite redemption is single-use on *attempt*.** A failed attempt (wrong token, expired) permanently invalidates the invite. Generate a new one if a user fumbles it.

## Granular permissions (v2)

Beyond the org role, admins and entry owners can grant access to specific entries or paths via the unified `permissions` table.

Key properties:

- **One table, polymorphic principals.** A grant's principal is either a `user` or a `group`, keyed by `(principal_kind, principal_id)`.
- **Group membership is resolved server-side.** Granting `group:engineering` access to `Projects/atlas/` propagates immediately to every member; no per-user duplication.
- **Grants are additive.** They widen access; they never restrict it.
- **Sensitivity ceiling still applies.** Even with a grant, a viewer can't reach `system` content if the role's sensitivity ceiling forbids it.
- **Resource is either `entry` or `path`.** Path grants apply to a logical-path *prefix*.

### Example — grant the engineering group editor access on a path

```bash
curl -X POST https://your-api-host/permissions \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "principal_kind": "group",
    "principal_id": "<group_id>",
    "resource_kind": "path",
    "resource_path": "Projects/atlas/",
    "level": "editor"
  }'
```

See [api/routes/permissions.py](../../api/routes/permissions.py) for the full request/response shapes; the `/docs` Swagger UI is canonical.

### Groups

Groups live in `groups` and `group_members`. Create a group, add members, then grant the group access. All mutations write `group_*` audit rows.

```bash
curl -X POST https://your-api-host/groups \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"name":"engineering"}'

curl -X POST https://your-api-host/groups/<group_id>/members \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"user_id":"<user_id>"}'
```

## Key types — what they do, where they come from

| key_type | source | Where issued | Use for |
|---|---|---|---|
| `interactive` | `web_ui` | `/setup`, `/auth/login` | A real human's normal API key. |
| `agent` | `agent` | Admin issues for an agent identity (often the same human, but for agent use). RLS blocks direct entry writes. | Long-running Claude sessions where every write should pass governance. |
| `api_integration` | `api` | Admin issues for service integrations. | CI scripts, automation, external services. |

The `source` column on writes is set automatically from the key type — agents can't impersonate `web_ui` writes.

### Issuing additional keys

`POST /auth/keys` (admin only) lets you mint additional keys for an existing user with a chosen `key_type`. See [api/routes/auth.py](../../api/routes/auth.py).

### Rotating a key

For a single user's interactive key, the simplest path is `/auth/login` — signing in **rotates the key**. Old keys for that user are invalidated.

For the admin / service keys:

- **`ADMIN_API_KEY`** — set explicitly in env (or auto-generated and logged once). To rotate: change the env var, restart the api. The old key continues to work until the api restart completes.
- **`BRILLIANT_SERVICE_API_KEY`** — used by the MCP to call the api. Rotate on **both** services together (api and mcp must agree). On Render, edit both services' env in one batch.
- **OAuth `client_secret`** — rotate from `/auth/login` with the "also rotate OAuth secret" checkbox. After rotation, every Co-work user must re-add the connector.

### Revocation

There's no separate revoke endpoint for arbitrary user keys today; rotation by the user (via `/auth/login`) is the in-product mechanism. For an emergency revoke, delete the row in `api_keys`:

```sql
DELETE FROM api_keys WHERE user_id = '<id>' AND key_prefix = 'bkai_xxxx';
```

After this, requests with the deleted key get 401.

## Special case: the seeded demo keys

If you used `--seed-demo` or ran a manual install with the seed data, your stack includes:

- `bkai_adm1_testkey_admin`
- `bkai_edit_testkey_editor`
- `bkai_view_testkey_viewer`
- `bkai_agnt_testkey_agent`

**These are public** — they're in the repo. Revoke them before any non-local exposure:

```sql
DELETE FROM api_keys WHERE key_prefix LIKE 'bkai_%' AND key_hash IN (
  SELECT key_hash FROM api_keys WHERE key_prefix IN
    ('bkai_adm1','bkai_edit','bkai_view','bkai_agnt')
);
```

Or simpler: re-run `/auth/login` with your admin email to rotate to a fresh admin key, then drop the demo seed.

## Audit trail

Every write goes through `audit_log` (an admin-role-only append-only table). Useful queries:

```sql
-- Recent mutations
SELECT created_at, actor_user_id, action, resource_type, resource_id
FROM audit_log
ORDER BY created_at DESC LIMIT 50;

-- All actions by a specific user
SELECT * FROM audit_log WHERE actor_user_id = '<user_id>' ORDER BY created_at DESC;

-- Group permission changes
SELECT * FROM audit_log WHERE action LIKE 'group_%' ORDER BY created_at DESC;
```

## See also

- [07-governance-pipeline.md](07-governance-pipeline.md) — what agent keys go through.
- [12-security.md](12-security.md) — RLS, OAuth, and key handling in depth.
- [11-observability-and-ops.md](11-observability-and-ops.md) — access logs, request logs, SQL dashboards.
