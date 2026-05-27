# Content Templates

Verbatim markdown blocks for the entries this skill writes. Load this file only when you
are actually composing one of these artifacts.

## Session Log (Compress / Save Session)

`content_type: daily`, `logical_path: Daily/{YYYY-MM-DD}`,
`title: Session Log: {YYYY-MM-DD} — {Topic Summary}`

```markdown
## Session Log: HH:MM — [Topic Summary]

### Quick Reference
**Topics:** [comma-separated]
**Outcome:** [what was accomplished]

### Decisions Made
- [Decision — reasoning]

### Key Learnings
- [Learning — what was discovered]

### Solutions & Fixes
- [Problem → Solution]

### Pending / Next Steps
- [Item that needs follow-up]

### Raw Summary
[Condensed narrative of the session]
```

Guidelines: keep Quick Reference to 5–6 lines (fast scan on resume); be thorough with Raw
Summary (future sessions depend on it). For a short/trivial session, write Quick Reference
only.

## Daily Note

`content_type: daily`, `logical_path: Daily/{YYYY-MM-DD}`, `title: Daily: {YYYY-MM-DD}`,
`tags: ["daily", "{YYYY-MM-DD}"]`. One per day — always append, never replace.

```markdown
## Session: HH:MM — [Topic]

**Focus:** [What was worked on]
**Outcome:** [What was accomplished]

- [Key item 1]
- [Key item 2]
```

Keep each session section brief — detailed findings go to dedicated entries. Daily notes
are the most-read entries on resume; keep them scannable.

## Meeting Note

`content_type: meeting`, `logical_path: Meetings/{YYYY-MM-DD}-{title}`,
`tags: ["meeting", "{type}"]`,
`domain_meta: {"meeting_type": "...", "participants": [...], "date": "YYYY-MM-DD"}`

```markdown
## Participants
- [Person A]
- [Person B]

## Summary
[2-3 sentence overview]

## Key Decisions
- [Decision 1]
- [Decision 2]

## Action Items
- [ ] [Person A] — [Task] (by [date])
- [ ] [Person B] — [Task] (by [date])

## Discussion Notes
### [Topic 1]
[Summary of discussion]

## Open Questions
- [Unresolved item 1]

## Follow-up
- Next meeting: [date/time if mentioned]
- Prepare: [items to prepare]
```

After filing: link to related projects/people/departments, then append a one-line
reference to today's daily note ("Meeting processed: {title}").
