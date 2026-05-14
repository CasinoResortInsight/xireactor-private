# 08 — Content & Search

> The data model your users live inside, and the retrieval surfaces an admin should understand to support them.

**Who this is for:** the admin who needs to answer "why did Claude not find that?" and "how should we organize this?"

This page is operator-flavored. End-user-facing skill conventions live in [skill/SKILL.md](../../skill/SKILL.md).

## The entry model

Every entry has:

| Field | Notes |
|---|---|
| `id` | UUID. Stable. |
| `title` | Free text. |
| `content` | Markdown. Pre-render strips frontmatter; wiki-links are resolved at render time. |
| `content_type` | One of the canonical types in `content_type_registry`. |
| `logical_path` | Hierarchical path string (`Projects/Atlas/Onboarding`). Not a real filesystem. |
| `tags` | Array of strings. Free-form but organizationally consistent (see "tag triangulation"). |
| `domain_meta` | JSONB. Per-content-type metadata (e.g. meeting participants, decision rationale). |
| `sensitivity_level` | Drives governance tier and RLS visibility. |
| `tsvector` | Full-text search index. |
| `embedding` | pgvector 1536d (for future semantic search). |
| `epistemic` fields | `claim_type`, `source_confidence`, `verification_status`, `conflict_with` (added in migration [033_epistemic_axis.sql](../../db/migrations/033_epistemic_axis.sql)). |

Versioning is append-only via `entry_versions` — no UPDATE/DELETE policies. Every change writes a new version row.

## Content types

The canonical list lives in `content_type_registry`. Fetch via the `get_types` MCP tool or `GET /types`. Common types:

- `context` — user/team identity, preferences
- `project` — project info and status
- `meeting` — meeting notes
- `decision` — a decision with rationale
- `intelligence` — competitive / market intel
- `daily` — session log / journal
- `resource` — SOP, guide, reference
- `department`, `team`, `onboarding`
- `system` — org-wide rules and conventions (high-sensitivity by default)

Aliases are handled in the registry — if a user says "task" but the canonical is `task`, the registry resolves it.

To add a content type, insert into `content_type_registry`. Migration [007_type_registry.sql](../../db/migrations/007_type_registry.sql) is the source schema.

## Logical paths

`logical_path` is a virtual hierarchy:

- Stored as a string with `/` separators.
- Filtered by prefix (e.g. `logical_path LIKE 'Projects/%'`).
- Used for grouping in the manifest's `top_paths` summary.
- **Not** a filesystem path. Not validated against the file tree of the running container.

By convention, paths capitalize the top-level bucket: `Projects/`, `Decisions/`, `Meetings/`, `System/Rules/`, `Daily/{YYYY-MM-DD}`.

## Cross-references — wiki-links and markdown links

Two link forms are extracted on write and resolved on read:

- **`[[slug-or-title]]`** — Obsidian-style wiki link. Preferred; matches the seeded vault convention.
- **`[label](slug-or-title)`** — standard markdown link. Also extracted; useful when you want a custom display label.

Resolution strategy on both: tail segment of logical_path → full logical path → title. The two forms dedup against each other. URLs (`https://...`, `mailto:...`), anchors (`#section`), absolute paths (`/path`), and image syntax (`![alt](src)`) are **never** extracted.

Render-time behavior: `GET /entries/{id}` rewrites `[[slug]]` to `[Title](/kb/{target_id})`. Unresolved slugs are preserved as literal text — nothing silently disappears.

Write-path sync is in `api/services/links.py`: `POST /entries` and `PUT /entries/{id}` call `sync_entry_links` to re-derive `entry_links` rows. This is what makes wiki-links work *immediately* after a create — without it, the resolver would have nothing to join against.

## Tags and tag triangulation

Tags are the highest-signal narrowing axis at session start. Three primitives:

- `manifest.tags_top` — top ~20 tags by entry count, returned in `session_init`.
- `list_tags(limit=N)` — paginated full corpus with usage counts.
- `get_tag_neighbors(tag)` — tags that co-occur with a given tag, ranked by co-count and Jaccard similarity.

Multi-tag AND search: `search_entries(tags=["a","b"])` returns entries having **both**.

This matters operationally: when end users complain that Claude can't find their content, the answer is often *tag the entries consistently and `tags_top` will surface them*. Encourage `suggest_tags` (which ranks existing org tags by content match) instead of inventing new ones for every entry.

## LOD — multi-resolution browsing

The KB exposes a multi-resolution view via `get_lod`. Levels:

| Level | Scope | What it returns |
|---|---|---|
| **0** | corpus | Edge counts, relation-type histogram, degree bins, orphan count, size buckets, tag-triangulation motifs (`project:* + task + task:blocked`, etc.). The "structural silhouette" of the KB. ~3K tokens. |
| **1** | community | Categorical breakdown of a single community (tag- or path-defined). Structural-only. |
| **2** | community | Full community silhouette: counts + dominant tags + dominant content_types. |
| **4** | node | Per-entry silhouette: title, tags, length, in/out degree, clusters. |
| **6** | node | Markdown heading outline of a single entry (no LLM). |

Three axes:

- **`structural`** — graph shape (degree, edges, communities). Supported at all levels.
- **`heat`** — activity bands (cold / warm / hot / spiking) over `entry_access_log`. Supported at LOD0, LOD2, LOD4.
- **`epistemic`** — verification-status counts (`verified`, `unverified`, `disputed`, `deprecated`) plus per-community breakdown. Supported at LOD0, LOD2, LOD4. **LOD1 and LOD6 reject `axis=epistemic` with 400** — those levels are structural-only by design.

End users coming from the skill use LOD0 first, descend with LOD2 (community), then LOD4 (node). As an admin, the LOD endpoints are useful for sanity-checking a fresh import or diagnosing a "why does Claude keep missing this?" complaint.

See [skill/references/api-reference.md](../../skill/references/api-reference.md) for full request/response examples.

## Search

### Full-text

```
search_entries(q="onboarding", limit=10)
search_entries(q="pricing", content_type="decision")
```

### Fuzzy fallback

```
search_entries(q="klaude", fuzzy=True)
```

`fuzzy` engages **only when the FTS path returns zero rows**. Default off so existing behavior is unchanged. Useful for typos and near-misses.

### Filtered browsing

```
search_entries(content_type="decision")
search_entries(logical_path="Projects/alpha/")
search_entries(department="engineering")
search_entries(tags=["client-thryv","onboarding"])  # AND semantics
```

### Graph traversal

```
get_neighbors(entry_id, depth=2)
```

Recursive CTE in Postgres — no graph extension required.

### Index endpoints

`get_index` gives broader views than search:

```
get_index(depth=4)                       # summaries everywhere
get_index(depth=3, path="Projects/")
get_index(depth=3, content_type="decision")
get_index(depth=3, tag="client-thryv")
```

### The L2+ scale guard

`get_index` at `depth >= 2` applies a guard: if the KB has **more than 200 visible published entries** AND no narrowing filter is passed, the call returns:

```json
{
  "error": "index_too_large",
  "total": <N>,
  "hint": "narrow with path=, content_type=, tag=, or use search_entries"
}
```

with HTTP 422.

`depth=1` is always safe (category counts are bounded). For `>= 2`, narrow first.

## What this means for an admin

You don't have to operate any of these endpoints day-to-day, but you do need to know:

- **Tags drive discovery quality.** Push your team toward consistent tagging via `suggest_tags`.
- **`logical_path` drives organization.** A flat KB is a hard-to-browse KB. Encourage the auto-routing table convention from [skill/SKILL.md](../../skill/SKILL.md).
- **The L2+ guard exists** so a bad query doesn't blow the token budget. If users complain about 422s, the fix is filtering, not removing the guard.
- **Render-time wiki-link resolution** depends on write-path link sync. If you're seeing `[[broken]]` literal text appear after a vault import, the import wrote rows but didn't sync links — re-running the entry through `update_entry` fixes it.

## See also

- [09-importing-content.md](09-importing-content.md) — getting existing knowledge in.
- [07-governance-pipeline.md](07-governance-pipeline.md) — sensitivity and tier interaction.
- [skill/SKILL.md](../../skill/SKILL.md) — end-user retrieval conventions.
