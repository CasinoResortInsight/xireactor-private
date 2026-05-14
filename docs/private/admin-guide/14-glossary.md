# 14 — Glossary

> One-line definitions of project-specific terms. Read top to bottom to inoculate yourself; come back as a reference.

| Term | Definition |
|---|---|
| **Anchor** | The local folder a user connects to Brilliant via MCP. Holds `inbox/`, `outbox/`, `archive/`, and `.claude/CLAUDE.md`. The filesystem-side surface; the KB itself owns logical structure. |
| **Append-only** | Of `entry_versions` and `audit_log`: rows are inserted, never updated or deleted. Older versions remain queryable. |
| **API key** | Bearer token used as `Authorization: Bearer <token>`. Looked up by 9-char prefix, bcrypt-verified against `key_hash`. |
| **Axis** | A way of looking at the KB in `get_lod`. `structural` (graph shape), `heat` (recent activity), `epistemic` (verification status). |
| **`batch_id`** | Identifier returned by every import. Pass to `rollback_import` to undo. |
| **`bkai_…`** | API key prefix. Visible part of the token; uniquely identifies a key in `api_keys`. |
| **Brilliant-Anchor** | See *Anchor*. |
| **`claim_type`** | Epistemic-axis field on entries. What kind of statement an entry makes (fact, opinion, decision, etc.). |
| **`content_type`** | The shape of an entry. `decision`, `meeting`, `system`, `daily`, etc. Defined in `content_type_registry`. |
| **Co-work** | Claude's browser-based collaboration product. Connects to Brilliant via the remote MCP + OAuth custom-connector flow. |
| **Daily note** | An entry with `content_type=daily`, `logical_path=Daily/{YYYY-MM-DD}`, used as a session log. One per day, appended throughout. |
| **DCR** | Dynamic Client Registration. Disabled on the remote MCP — clients must use the pre-minted `client_id`/`client_secret` from `/setup`. |
| **Density manifest** | The compact (~2K-token) summary returned by `session_init`. Tells agents *what exists* without inlining content. |
| **`domain_meta`** | JSONB column on entries for content-type-specific metadata (meeting participants, decision rationale, etc.). |
| **Edge** | A row in `entry_links` connecting two entries with a typed relationship. |
| **Entry** | The unit of content. Row in `entries`. |
| **Epistemic axis** | Per-entry metadata about claim provenance: `claim_type`, `source_confidence`, `verification_status`, `conflict_with`. |
| **Frontmatter** | YAML block at the top of an imported markdown file. Stripped before storage; some fields lifted into `domain_meta`. |
| **Governance tier** | T1–T4 classification of a write. Determines auto-promote / conflict-check / AI-review / human-only behavior. |
| **Granular permissions** | The v2 `permissions` table. Per-entry / per-path grants on top of org role. Polymorphic principal (`user` or `group`). |
| **Group** | Named collection of users (`groups` + `group_members`). Usable as a principal in granular permissions. |
| **HMAC handoff** | The HMAC-SHA256 signature on the OAuth redirect from MCP `/authorize` back to MCP after api login. Signed with `OAUTH_HANDOFF_SECRET`. |
| **Inbox** | The `inbox/` folder of an anchor. Drop zone for files to be ingested. |
| **`import_batches`** | Table tracking each import as a rollback-able unit. |
| **Interactive key** | API key with `key_type=interactive`, `source=web_ui`. Issued by `/setup` and `/auth/login`. Can write directly. |
| **Latch** | The first-run flag in [db/migrations/027_first_run_flag.sql](../../db/migrations/027_first_run_flag.sql). False before `/setup`, true after. |
| **LOD** | Level of Detail. Multi-resolution view of the KB. LOD0 (corpus), LOD1/2 (community), LOD4 (node), LOD6 (markdown outline). |
| **Logical path** | The hierarchical "folder" string on an entry (e.g. `Projects/Atlas/Onboarding`). Not a real filesystem path. |
| **Manifest** | The `manifest` object in `session_init`'s response. |
| **MCP** | Model Context Protocol. The protocol Claude clients use to call tools. |
| **Migration** | A sequential SQL file in [db/migrations/](../../db/migrations/). Applied in order at api startup. Forward-only. |
| **Node** | A single entry, in LOD/graph terminology. |
| **OAuth client** | The `client_id` + `client_secret` issued at `/setup`. Used by the Co-work custom-connector flow. |
| **`OAUTH_HANDOFF_SECRET`** | HMAC key used to sign the redirect between MCP `/authorize` and api `/oauth/login`. Must be identical on both services. |
| **Outbox** | The `outbox/` folder of an anchor. Where agents write reports / exports for the user to read. |
| **Permissions v2** | The unified `permissions` table model (migration 018/019). Replaces the legacy `entry_permissions` / `path_permissions` tables. |
| **`principal_kind`** | `user` or `group`. The type of subject in a granular permission grant. |
| **`process_staging`** | Batch routine that walks every `pending` staging item, runs validation/dedup/conflict/Tier-3-AI checks. Admin-only. |
| **Promoted entry** | A staging item that's been approved and committed to `entries`. The staging row carries a `promoted_entry_id`. |
| **Refcount** | Counter on a blob row; incremented on dedup'd uploads, decremented when an owning entry is deleted. Eligible for cleanup at zero. |
| **`request_log`** | Per-HTTP-request table. Method, path, status, latency, approximate token usage. RLS-scoped. |
| **`review_staging`** | Admin-only call to approve or reject a single staging item. |
| **RLS** | Row-Level Security. Postgres feature; the primary tenant- and per-user isolation in Brilliant. Enabled and forced on every data table. |
| **Sensitivity ceiling** | The maximum sensitivity level a role can read/write to. Grants cannot lift it. |
| **Sensitivity level** | A column on entries that, together with role, determines visibility and governance tier. |
| **Service-role key** | The `BRILLIANT_SERVICE_API_KEY` used by MCP to call the api. Honors `X-Act-As-User`. |
| **`session_init`** | The MCP tool / REST endpoint that returns the manifest at session start. |
| **`source`** | The provenance label on a write. `web_ui`, `agent`, or `api`, derived from key type. |
| **Staging** | The `staging` table — induction queue for writes pending governance. |
| **Tag triangulation** | The set of tag-driven narrowing primitives: `tags_top`, `list_tags`, `get_tag_neighbors`, multi-tag AND search. |
| **Tier** | See *Governance tier*. |
| **`tsvector`** | Postgres full-text search type. Stored on each entry. |
| **`verification_status`** | Epistemic-axis field. `verified`, `unverified`, `disputed`, `deprecated`. |
| **Vault** | An Obsidian-style or plain-markdown folder being imported. |
| **Wiki-link** | The `[[slug-or-title]]` reference syntax. Extracted on write into `entry_links`; resolved at read time in `GET /entries/{id}`. |
| **`X-Act-As-User`** | HTTP header the MCP sets when calling the api on behalf of a Co-work user. Honored only from service-role keys. |

## See also

- [01-overview.md](01-overview.md) — concepts in narrative form.
- [skill/SKILL.md](../../skill/SKILL.md) — the end-user view of many of these terms.
- [ARCHITECTURE.md](../../ARCHITECTURE.md) — implementation depth.
