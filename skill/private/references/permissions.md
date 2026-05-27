# Permission Awareness

RLS (Row-Level Security) is enforced at the database level — you cannot bypass it. The
index and search automatically filter to entries you can see. A 404 may mean the entry
exists but is outside your permission scope. Your `source` tag is set automatically. Check
`manifest.user.role` from `session_init` to know your capabilities.

## Role capabilities

| Role | Read | Direct Write | Staging | Approve/Reject |
|---|---|---|---|---|
| **admin** | All entries | All entries | Can submit | Yes |
| **editor** | Shared + own dept + owned | Shared + own dept + owned | Can submit | No |
| **commenter** | Shared + assigned | No | Can submit (proposals) | No |
| **viewer** | Non-private, non-system | No | No | No |

## Granular permissions (v2)

Beyond org-wide roles, admins and entry owners can grant per-entry or per-path access
through a unified `permissions` table with **polymorphic principals**:

- A grant's principal is either a `user` or a `group` — one table, `principal_kind + principal_id`.
- **Group membership is resolved server-side.** Granting `group:engineering` access
  immediately propagates to every member; no per-user duplication.
- Grants apply to a single entry or to a path prefix (e.g., `Projects/alpha/`).
- Grants are **additive** — they widen access, never restrict it.
- Sensitivity ceiling still applies — grants respect the role's sensitivity limits.

## Personal zones (default-safe writes)

Every user has an auto-created **personal zone** — a private group walled off from everyone
else, including org admins via the API. It is the default landing pad so nothing leaks
before the user decides who should see it.

- Any `create_entry` / `submit_staging` create **without an explicit `sensitivity`** lands
  in the caller's zone — visible only to them. Same for explicit `sensitivity='private'`.
- To share, call `promote_entry(entry_id, add_principals=[...], new_sensitivity=...)`.
  Promotion is **additive** — the zone grant is permanent; you can only widen scope, never
  narrow below the owner.
- `list_zone(limit=, offset=)` shows the caller's own zone (only ever the caller's).
- "Share this with the team" → promote, don't recreate. Don't pass `sensitivity` on the
  original create just to skip the zone; the safety default exists so nothing leaks
  pre-review.

### Worked example

User: "Share my Atlas onboarding doc (`entry_abc123`) with the engineering group as
viewers, and bump it to shared."

```
promote_entry(
  entry_id="entry_abc123",
  add_principals=[{"principal_type": "group", "principal_id": "<engineering_group_id>", "role": "viewer"}],
  new_sensitivity="shared",
)
```

After this call: engineering can read the entry, the caller still has admin (zone grant
intact), and `sensitivity` is now `shared`. Confirm with the human-readable summary the
tool returns.
