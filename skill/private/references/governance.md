# Governance

The staging/governance pipeline reviews proposed changes before they sync. Agent-key
writes always route here via `submit_staging`.

## Checking & filtering the queue

```
list_staging(status="pending")
list_staging(status="pending", target_path="Projects/")
list_staging(status="pending", change_type="update")
```

## Reviewing (admin only)

```
review_staging(staging_id, action="approve", reason="Content verified")
review_staging(staging_id, action="reject", reason="Needs more detail")
```

## Batch processing (admin only)

```
process_staging()
```

Runs type validation, duplicate detection, conflict detection, and version staleness
checks on all pending items. Clean items are auto-approved.

## Governance tiers

| Tier | Behavior | When |
|---|---|---|
| 1 | Auto-approved immediately | Low-risk creates, appends, links; admin/editor web_ui |
| 2 | Auto-approve with conflict checks | Updates on non-sensitive content; clean → sync; conflicts escalate to T3 |
| 3 | AI or batch review (pending impl) | High-sensitivity content + T2 escalations; sits pending until `process_staging` or manual review |
| 4 | Human-only | Deletions, sensitivity changes, governance rule mods; only `review_staging` can resolve |

Tier 3 AI reviewer is spec'd (0027) but not yet shipped; T3 items currently await manual
review via `review_staging` or batch evaluation via `process_staging`.
