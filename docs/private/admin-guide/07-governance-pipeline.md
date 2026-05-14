# 07 — Governance Pipeline

> The four-tier review system, why it exists, and how to operate it.

**Who this is for:** the admin keeping the KB trustworthy as agents start writing into it.

## Why governance exists

When humans and agents share a KB, three things go wrong without a gate:

1. **Stale overwrites.** Agent A updates an entry, Agent B does too — last write wins; one of them silently disappears.
2. **Sensitive content drift.** Anyone with editor role can rewrite a `system` rule or a strategic decision without leaving a trail.
3. **Volume.** Agents can produce 100x the writes a human team would. Without filtering, your KB drowns in noise.

The governance pipeline routes every agent-key write through a `staging` table. Each item gets a tier (1–4) at submission time based on change type, content sensitivity, source, and role. Tier determines what happens next.

Direct writes from interactive (`web_ui`) keys held by admin/editor roles can skip the staging table entirely (they're effectively Tier 1) — RLS still applies.

## The four tiers

| Tier | When it fires | What happens |
|---|---|---|
| **1 — Auto-approve** | Creates of non-sensitive content, appends, links, tags; admin/editor `web_ui` writes | Committed synchronously. Response includes `promoted_entry_id`. |
| **2 — Auto-approve with conflict checks** | Updates / modifications on non-sensitive content | Inline staleness, duplicate, and content-hash checks. Clean → auto-approve. Conflicts → escalate to T3. |
| **3 — AI review** | High-sensitivity content (`system`, `strategic`), Tier 2 escalations | Sits `pending` until either `process_staging` runs the AI reviewer (if `ANTHROPIC_API_KEY` set) or a human resolves it via `review_staging`. |
| **4 — Human only** | Deletions, sensitivity changes, governance-rule modifications | Cannot auto-approve. Must be resolved with `review_staging`. |

Tier assignment lives in `_assign_governance_tier()` in [api/routes/staging.py](../../api/routes/staging.py); the constraint is in [db/migrations/012_governance_4tier.sql](../../db/migrations/012_governance_4tier.sql).

## How a write flows

```
Agent calls submit_staging
        │
        ▼
  _assign_governance_tier()  ──── tier ∈ {1,2,3,4}
        │
        ├─ T1 ──▶ commit immediately, return promoted_entry_id
        │
        ├─ T2 ──▶ run conflict checks
        │           ├─ clean   ──▶ commit, return promoted_entry_id
        │           └─ dirty   ──▶ escalate to T3 (status=pending, tier=3)
        │
        ├─ T3 ──▶ status=pending; resolve via:
        │           ├─ process_staging → AI reviewer (if ANTHROPIC_API_KEY)
        │           └─ review_staging  → human admin
        │
        └─ T4 ──▶ status=pending; resolve via review_staging only
```

## Operating the queue

These are the day-to-day calls an admin makes. Available as MCP tools and as REST endpoints.

### List pending work

```
list_staging(status="pending")
list_staging(status="pending", target_path="Projects/")
list_staging(status="pending", change_type="update")
```

The `session_init` manifest also surfaces pending Tier 3+ items in `manifest.pending_reviews` — every session start gives admins a heads-up. See [api/routes/session.py](../../api/routes/session.py).

### Resolve a single item (admin only)

```
review_staging(staging_id, action="approve", reason="Content verified")
review_staging(staging_id, action="reject", reason="Needs more detail")
```

The `reason` is recorded on the staging row and emitted to the audit log.

### Batch process (admin only)

```
process_staging()
```

Walks every `pending` item and runs:
- Type validation
- Duplicate detection
- Conflict detection
- Version staleness checks
- Tier 3 AI review (if `ANTHROPIC_API_KEY` is set)

Clean items auto-approve. Tier 3 items the AI escalates stay pending. Run `process_staging` periodically (a cron job or a scheduled session) to keep the queue from accumulating.

## Tier 3 AI reviewer in detail

Lives in [api/services/ai_reviewer.py](../../api/services/ai_reviewer.py). For each Tier 3 item:

1. Fetches 3–5 related entries (logical-path prefix + tag overlap) for context.
2. Sends the proposed change + context to Anthropic (`claude-sonnet-4-6`, max 1024 tokens) with a system prompt containing the four-tier rules verbatim.
3. Parses a structured `{action, reasoning, confidence}` JSON response.
4. **Confidence floor: 0.7.** Anything below is overridden to `escalate` regardless of stated action.
5. **Fail-safe**: missing `ANTHROPIC_API_KEY`, API errors, malformed responses, parse failures → `escalate`.

The reviewer never auto-approves on ambiguity. Invalid actions and low-confidence results always escalate to Tier 4.

### Enabling, disabling, tuning

- **Enable:** set `ANTHROPIC_API_KEY` and restart the api.
- **Disable:** unset `ANTHROPIC_API_KEY` and restart. Tier 3 items will sit pending until manually reviewed.
- **Confidence threshold:** the floor is hard-coded at 0.7 in `ai_reviewer.py`. Changing it requires a code patch.
- **Model choice:** the model name is also in `ai_reviewer.py`. Newer Sonnet/Opus models are drop-in replacements as long as they accept the existing system prompt.

## When Tier 3 items sit pending forever

Symptoms:

- `list_staging(status="pending")` keeps growing
- `manifest.pending_reviews.count` stays high

Common causes:

1. **`ANTHROPIC_API_KEY` not set** — the reviewer fails-safe to `escalate`, but `process_staging` actually runs the call only if the key exists. Check via `printenv ANTHROPIC_API_KEY` inside the api container.
2. **`process_staging` is never called** — auto-batching isn't on a timer in the api. Either schedule it as a cron'd `curl` from the host, run it from a scheduled Claude session, or accept manual `review_staging` as the SOP.
3. **Items legitimately need a human** — Tier 4 items are designed for this.

## What admins should keep an eye on

| Signal | Where | What to do |
|---|---|---|
| `pending_reviews.count` rising | `session_init` manifest at session start | Run `process_staging`; if AI review is enabled, the queue should drain. |
| Repeated rejects on the same path | `audit_log` filtered by action `staging_reject` | Investigate the upstream agent — wrong content type? Bad routing? |
| Tier 4 items piling up | `list_staging(status="pending", change_type="delete")` | These need a human; review weekly at minimum. |

## See also

- [06-user-and-permission-management.md](06-user-and-permission-management.md) — key types and write paths.
- [08-content-and-search.md](08-content-and-search.md) — content types and sensitivity levels (which influence tier).
- [12-security.md](12-security.md) — sensitivity ceiling and how it interacts with grants.
