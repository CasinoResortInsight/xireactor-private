# User Guide

A guide for teammates using Brilliant through Claude Co-work, after an admin has already deployed it for your company. If you are the admin standing up the stack, start with the [README](../README.md) instead.

## What Brilliant gives you

Brilliant is your company's shared knowledge base — the place where decisions, meeting notes, project context, and institutional know-how live so that every Claude session can read and write the same source of truth. Instead of every Co-work session starting from scratch, your agent comes pre-loaded with the context it needs and can preserve anything new it learns. Governance keeps quality high as the team scales: low-risk writes go live immediately, sensitive ones are routed for review.

You interact with Brilliant by talking to Claude in Co-work. There is no separate app to learn.

## Before you start

Get four things from your admin:

1. **Invite code** — looks like `CTX-XXXX-XXXX`.
2. **One-time invite token** — paired with the code.
3. **MCP connector URL** — `https://<your-company>-brilliant-mcp.onrender.com/mcp` or similar.
4. **OAuth `client_id` and `client_secret`** — two short strings.

The invite is single-use on *attempt*. If you mistype the token, the invite is permanently invalidated and your admin has to issue a new one. Copy-paste, don't retype.

## Connect Brilliant to Claude Co-work

In Co-work, open the custom-connector dialog and fill four fields:

| Field | Value |
|---|---|
| Name | Anything (e.g. `Brilliant`) |
| MCP URL | The URL from your admin |
| Client ID | The `client_id` from your admin |
| Client secret | The `client_secret` from your admin |

When you save, Co-work opens a browser tab to the Brilliant login page (`/oauth/login`). Sign in with your Brilliant email and password — see *Redeem your invite* below if you don't have those yet. Co-work flashes "connected" and you're done.

If Co-work doesn't already have the Brilliant skill installed, your admin can hand you `skill/brilliant-kb-assistant.zip` from the repo to side-load.

## Redeem your invite

If your admin sent you an invite code (rather than pre-creating an account), redeem it from inside Claude on your first session. Just say:

> Redeem invite `CTX-XXXX-XXXX` token `<one-time-token>` for `you@example.com` as `Your Name`.

Claude calls the `redeem_invite` tool and returns an API key. **Save this key somewhere secure — it is shown once and never again.** It's your panic button if you ever lose Co-work access; you'll use it to sign in directly to the Brilliant API and rotate fresh credentials.

## Set up your Brilliant Anchor folder

Optional but strongly recommended. The Anchor is one local folder Claude treats as a desk:

```
<anchor-root>/
  inbox/        drop files here for Claude to ingest
  outbox/       reports/exports Claude produces land here
  archive/      ingested files moved here, dated
  .claude/
    CLAUDE.md   anchor-local notes Claude maintains automatically
```

Pick any folder, create the four subfolders (Claude will fill in `.claude/CLAUDE.md` itself), and tell Claude where it lives. From then on:

- Drop a PDF, transcript, email, or markdown file into `inbox/` and ask Claude to "process the inbox" — it extracts content, files entries in the KB, and moves the original to `archive/{today}/`.
- When you ask Claude to write a report or summary, it lands in `outbox/` as a markdown file you can open directly.

You don't need an Anchor folder to use Brilliant — you can do everything by typing in Co-work — but it's the lowest-friction way to get bulk content into the KB.

## Day-to-day — what to say to Claude

You don't memorize commands. You describe what you want; the skill maps your phrasing to the right action. Some examples:

| Say to Claude... | What happens |
|---|---|
| "resume" / "pick up where I left off" | Loads recent daily notes, surfaces pending reviews, lists inbox files |
| "process the inbox" | Files in `inbox/` are ingested into the KB, then moved to `archive/` |
| "what do we know about X?" / "search the KB for X" | Searches by keyword, tag, or path and returns the most relevant entries |
| "remember this: ..." / "save this" | Routes the content to the right entry type and path automatically |
| "create a meeting note from this transcript" | Builds a structured meeting entry with decisions, action items, participants |
| "what's pending review?" | Shows the governance queue |
| "save", "compress", or "end session" | Writes a daily session log so the next session resumes cleanly |
| "write me a report on X" | Drops a markdown file in `outbox/` |
| "daily" / "what did I do yesterday?" | Shows or appends to the daily journal |

If a phrase doesn't seem to land, ask Claude what it can do — the skill knows its own routing table and will show you.

A core principle of the skill: **never ask permission to save**. If you mention a decision, a learning, or a correction in passing, Claude will preserve it without prompting and tell you where it went. If you don't want something saved, say so before mentioning it.

## Bulk-import existing notes

If you have an existing Obsidian vault, a Notes export, or a folder of markdown files you want to seed the KB with, **don't try to push them through Claude** — Co-work has a per-turn output cap that's smaller than a real vault.

Instead, in your browser, open:

```
https://<your-api-host>/import/vault
```

Drop a `.zip` or `.tgz` of your vault folder onto the page and submit. The page handles the import server-side and shows you how many entries were created, how many went to staging, and the rollback command in case you want to undo. Your admin has the api host URL — it's one of the six fields on the credentials page.

For a single file (a PDF, a transcript), just drop it in your Anchor `inbox/` and let Claude ingest it.

## Permissions — what you can see and do

Brilliant uses row-level security: the search and index automatically filter to entries you're allowed to see. Your role determines your default capabilities:

| Role | Read | Write |
|---|---|---|
| **admin** | Everything | Direct writes everywhere |
| **editor** | Shared org content + your dept + entries you own | Direct writes within scope |
| **commenter** | Shared content + entries assigned to you | Proposals only (routed to staging) |
| **viewer** | Non-private content | Read-only |

Two practical consequences:

- A 404 on an entry doesn't always mean it doesn't exist — it may exist but be outside your permission scope. Ask your admin if you think you should have access.
- Your admin can grant you per-entry or per-path access on top of your role (e.g. `Projects/alpha/`) without changing your overall role.

## Governance — why a write didn't go live instantly

Brilliant routes writes through four tiers:

| Tier | What happens | When it applies |
|---|---|---|
| 1 | Auto-approved instantly | Low-risk creates and appends |
| 2 | Auto-approved with conflict checks | Updates on non-sensitive content |
| 3 | Pending review | Sensitive content; resolved by an admin or batch process |
| 4 | Human-only review | Deletions, sensitivity changes, governance rule edits |

If you write through Co-work and the change doesn't appear immediately, it likely went to staging. Ask Claude "what's pending review?" to see the queue. Admins resolve items with `review_staging` or kick off a batch with `process_staging`.

## Recovering credentials

Lost your API key? Visit `https://<your-api-host>/auth/login` and sign in with your Brilliant email and password. The login **rotates your API key** — all prior keys become invalid, a fresh one is issued, and you get a new `brilliant-credentials.txt` to download. Treat this as a panic button if you ever suspect a key has leaked.

## Troubleshooting

- **Connector won't connect.** Confirm the MCP URL is HTTPS and reachable from the public internet (Co-work rejects localhost). Double-check that `client_id` and `client_secret` aren't swapped.
- **"Skill incompatible with API" banner on session start.** Your bundled skill is older than the API requires. Ask your admin for the current `skill/brilliant-kb-assistant.zip` and re-install in Co-work.
- **Search returns nothing for a term you know exists.** Ask Claude to "search loosely" (engages the fuzzy fallback) or to browse by tag instead. Common cause: a typo or a tag-only entry.
- **Claude says it can't post a comment on an entry.** Comments are web/API-only; there is no MCP tool for them. Use the API directly or ask your admin.
- **Invite redemption failed.** The invite is now permanently invalid — even a wrong-token attempt burns it. Ask your admin for a fresh invite.

## Where to go next

- [README](../README.md) — admin-side setup and deploy paths
- [ARCHITECTURE.md](../ARCHITECTURE.md) — how Brilliant works under the hood
- [skill/SKILL.md](../skill/SKILL.md) — full reference for the skill's behavior, routing rules, and MCP tool catalog
- [docs/ATTACHMENTS.md](ATTACHMENTS.md) — how file attachments and PDF digests work
- [docs/OBSERVABILITY.md](OBSERVABILITY.md) — usage analytics (admin-oriented)
