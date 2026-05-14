# Brilliant User Guide

A comprehensive manual for **self-hosting administrators** of xiReactor Brilliant — the people who install, configure, operate, secure, back up, upgrade, and troubleshoot the stack for their team.

> Written against **v0.9.0**. Features evolve quickly; cross-check anything that looks off against [CHANGELOG.md](../../CHANGELOG.md) and the source.

## Who this guide is for

You run the stack. Your team uses it. You need to know:

- How to deploy it (Render, Docker Compose, `install.sh`)
- How to configure it (env vars, ports, storage backend, AI reviewer)
- How to connect Claude Co-work, Claude Desktop, and Claude Code to it
- How to invite users, scope their permissions, and rotate keys
- How governance, RLS, and the OAuth gates work — well enough to defend them
- How to back up, monitor, upgrade, and recover the stack
- What to do when something goes wrong

If you are an **end user** (a teammate using the skill in Co-work), most of this guide is too low-level for you — start with [05-connecting-clients.md](05-connecting-clients.md) instead. If you are a **contributor**, read [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Table of contents

1. [Overview](01-overview.md) — what Brilliant is, core concepts, architecture.
2. [Deployment options](02-deployment-options.md) — Render vs. Docker Compose vs. `install.sh` vs. manual.
3. [Installation](03-installation.md) — step-by-step for each path; the `/setup` ceremony; smoke test.
4. [Configuration](04-configuration.md) — every environment variable, ports, storage backend, Tier 3 AI reviewer.
5. [Connecting clients](05-connecting-clients.md) — Co-work custom connector, Claude Desktop / Claude Code stdio, REST, skill bundle install.
6. [User & permission management](06-user-and-permission-management.md) — roles, invites, granular permissions, key types, rotation.
7. [Governance pipeline](07-governance-pipeline.md) — the four tiers, admin operations, AI reviewer.
8. [Content & search](08-content-and-search.md) — entry model, wiki-links, tags, LOD, search.
9. [Importing content](09-importing-content.md) — browser upload, MCP bulk import, rollback.
10. [Attachments & storage](10-attachments-and-storage.md) — local vs. S3, dedup, backups.
11. [Observability & ops](11-observability-and-ops.md) — health, logs, dashboards, backup/restore, upgrades.
12. [Security](12-security.md) — RLS, OAuth gates, key rotation, sensitivity tiers.
13. [Troubleshooting](13-troubleshooting.md) — symptoms, causes, fixes.
14. [Glossary](14-glossary.md) — one-line definitions of project-specific terms.

## How to read this guide

- **First-time admins:** read 01 → 03 in order, then jump to 05 to wire up your first client. Come back to 04, 06, 07, 12 once you have a running stack.
- **Operators inheriting an existing deployment:** start with 04 (configuration), 11 (observability/ops), 12 (security), then skim 13 (troubleshooting) for symptoms you recognize.
- **Reference:** every page includes a `## See also` section linking to 2–3 related pages.

## Acceptance test

After reading 02 → 05, you should be able to:

1. Deploy a fresh Brilliant stack via your chosen path.
2. Complete `/setup` and download `brilliant-credentials.txt`.
3. Run `bash tests/demo_e2e.sh` against your deployment without errors.
4. Connect at least one Claude client (Co-work, Desktop, or Code) and successfully call `session_init`.

If any of those four steps fails, [13-troubleshooting.md](13-troubleshooting.md) is your first stop.
