# bkb — Brilliant KB dev/test CLI

A single-file Python CLI for driving the Brilliant REST API as different
users without re-pasting API keys. Lets you switch personas with one
command (`bkb use sam`) and then run create/comment/search/promote calls
against the active profile. Built for local development, demos, and
permission-model testing — not for production use.

The CLI talks to the **REST API on `:8010`** (host port for the Docker
`api` service). It does *not* go through the MCP server on `:8011`,
which uses OAuth and is the wrong door for scripted access.

---

## What it gives you

- **Multi-profile credential storage** at `~/.brilliant-dev/credentials.json`
  (chmod 600). One profile per user. The active profile is recorded in
  `~/.brilliant-dev/active`.
- **One-shot test-user provisioning** (`bkb provision`) — the admin runs
  this once, and `maria`, `devon`, `sam`, and `viewer` profiles are
  created via the standard invite + redeem flow.
- **Persona switching** — `bkb use <name>` flips the active profile;
  every subsequent call uses that user's API key.
- **Convenience wrappers** for the operations you actually do during
  testing: create/update/append entries, comment, link, search, promote,
  list tags/zone/members.
- **Raw passthrough** (`bkb api METHOD PATH [body]`) so you're never
  stuck when the wrappers don't cover an endpoint.

Stdlib only — no `pip install` needed.

---

## Install

Both scripts live in this repo under [`tools/`](../../tools/):

- `tools/bkb` — the CLI (Python 3, stdlib only)
- `tools/bkb-mcp` — bash launcher that the Brilliant stdio MCP server
  is registered as, so the `knowledge-base` skill picks up the active
  `bkb` profile

Install once per developer machine — symlink them onto your PATH:

```bash
mkdir -p ~/.local/bin
ln -sf "$PWD/tools/bkb"     ~/.local/bin/bkb
ln -sf "$PWD/tools/bkb-mcp" ~/.local/bin/bkb-mcp
bkb --help
```

(If `~/.local/bin` isn't on your PATH, add
`export PATH="$HOME/.local/bin:$PATH"` to your shell rc.)

The CLI keeps all state under `~/.brilliant-dev/` — nothing it writes
goes back into the repo. Symlinks mean you'll get script updates
automatically on `git pull`.

---

## First run: register the admin and provision test users

The admin key lives in `brilliant-credentials.txt` at the repo root.
Register it as a profile, then provision the four standard test users in
one shot:

```bash
bkb add admin bkai_512d_xxxxxxxx --email ken@argusslabs.com --note "from credentials file"
bkb use admin
bkb provision
```

`provision` creates four profiles via the same `POST /invitations` →
`POST /invitations/redeem` flow real users go through. All four test
passwords are `dev-password-1`. The resulting profiles are:

| Profile | Role | Maps to persona |
|---------|--------|-------------------|
| `maria` | admin | President / GM |
| `devon` | editor | Director of Marketing |
| `sam` | editor | Steakhouse GM |
| `viewer` | viewer | Generic viewer (permission testing) |

Re-run with `--force` to recreate (skips any profile already present
without the flag).

---

## Workflow basics

```bash
bkb list                  # show all profiles; '*' marks the active one
bkb use devon             # switch persona
bkb whoami                # confirms via /session-init what the server thinks
```

Most commands accept either a UUID **or** a logical path as the entry
reference — e.g. both of these work:

```bash
bkb get Decisions/2024/cage-ops-incident
bkb get e382ed7f-c94a-4dba-ae44-679cd1e57f55
```

Content for `entry`/`append`/`update` and `comment` can come from:

- `--content "literal string"`
- `--content @path/to/file.md`
- stdin (default if `--content` is omitted)

---

## Cheat sheet

### Entries

```bash
# Create with content from stdin
bkb entry decision Decisions/2026/foo "Decision title" --tag promotions --tag summer < body.md

# Create with content from a file, explicit sensitivity (skip the personal-zone default)
bkb entry resource Resources/sop "Our SOP" \
  --department f-and-b --sensitivity shared --content @/tmp/sop.md

bkb get Decisions/2026/foo                     # fetch (returns full JSON)
bkb append Decisions/2026/foo --content @addendum.md
bkb update Decisions/2026/foo --sensitivity operational --tag final
bkb delete <id> --yes
```

### Comments

```bash
bkb comment Decisions/2026/foo "Looks good"
bkb comment <id> --parent <parent_comment_id> "Reply to a thread"
bkb comments Decisions/2026/foo                # list with author + first 300 chars
```

### Links

```bash
bkb link <src> <tgt> --type relates_to
# valid types: contradicts | depends_on | part_of | relates_to | supersedes | tagged_with
```

### Search & browse

```bash
bkb search --q "fight night" --type decision --limit 10
bkb search --tag freeplay --tag mid-week                 # AND across tags
bkb search --department marketing --path Promotions/
bkb tags                                                  # all tags + counts
bkb zone                                                  # your own personal zone
bkb members                                               # (admin only) org members
```

### Promote a personal-zone entry

```bash
# Bump sensitivity and/or widen access
bkb promote <id> --sensitivity shared
bkb promote <id> --sensitivity shared --to group:<group_id>:viewer
bkb promote <id> --to user:<user_id>:editor
```

`--to` can be repeated for multiple principals; format is
`type:id:role` (type = `user` or `group`).

### Invite + redeem (for ad-hoc users)

```bash
bkb invite --role editor --email alice@dev.local
# prints invite_code, token, expiry — token shown ONCE
bkb redeem <code> <token> alice@dev.local "Alice Smith" dev-password-1 \
  --save alice --note "QA"
bkb use alice
```

### Raw passthrough

For anything the wrappers don't cover — staging review, attachments,
analytics, etc.

```bash
bkb api GET /analytics/top-entries
bkb api POST /staging @payload.json
bkb api PATCH /comments/<id> '{"status": "resolved"}'
```

Body argument accepts a literal JSON string, `@file.json`, or `-` for
stdin.

---

## What the CLI assumes about the server

- REST API on `BKB_BASE` (env var override) or whatever
  `~/.brilliant-dev/credentials.json` has under `base_url`. Default:
  `http://localhost:8010`.
- Bearer-token auth via `Authorization: Bearer <bkai_...>`.
- Standard Brilliant endpoints as documented in `/openapi.json` on the
  same host. Verify with `bkb api GET /openapi.json | jq '.paths | keys'`.

If you point the CLI at a remote Brilliant instance, just run:

```bash
bkb base https://kb.your-org.example.com
```

…then re-add profiles for that environment. The `base_url` is per
credentials file, so you'd typically have a separate
`BKB_CONFIG_DIR=~/.brilliant-prod bkb …` for production keys (read-only,
ideally).

---

## How sensitivity & department interact with the CLI

The CLI doesn't apply any client-side defaults — it sends exactly what
you pass. The server then applies its rules:

- If you create an entry **without** `--sensitivity`, the server forces
  `sensitivity = "private"` and writes the entry into the caller's
  **personal zone**. Only the caller can see it.
- To make a new entry team-visible up front, pass `--sensitivity shared`
  (or `operational` for editor-tier-only) on the `bkb entry` call.
- To share a zone entry *after* creation, use `bkb promote` rather than
  re-creating it — the zone grant is permanent and `promote` only widens
  scope.
- `--department` is free-text on the server (no enum). Useful for
  later filtering with `bkb search --department <name>`.

See `docs/private/USER_GUIDE.md` and `ACCESS_MODEL.md` for the full
sensitivity ladder and RLS semantics.

---

## Switching personas inside Claude Code (the `knowledge-base` skill)

The `bkb` CLI is for shell-side testing. To make the `knowledge-base`
skill (and any other tool that calls `mcp__brilliant__*`) act as a
specific user inside Claude Code, register the **`bkb-mcp` launcher**
as the Brilliant MCP server. The launcher reads the active `bkb`
profile at MCP startup and exports its API key into the stdio server's
environment — the skill then makes every call as that user.

### How it works

The Brilliant stdio MCP server (`mcp/server.py` in
`xireactor-brilliant`) reads one env var for auth:
`BRILLIANT_SERVICE_API_KEY`. In stdio mode it does *not* do its own
OAuth dance — whatever key is in the env at process start is the
identity every tool call uses. A regular user's `bkai_` key
authenticates as that user directly (no `X-Act-As-User` needed).

`bkb-mcp` is a small bash launcher (in [`tools/bkb-mcp`](../../tools/bkb-mcp),
symlinked onto your PATH per the install step above) that:

1. Reads `~/.brilliant-dev/active` for the current profile name.
2. Loads that profile's `api_key` and `base_url` from
   `credentials.json`.
3. Exports `BRILLIANT_SERVICE_API_KEY` + `BRILLIANT_BASE_URL`.
4. `exec`s the real stdio server inside `xireactor-brilliant/mcp/.venv`.

Result: the skill's tools (`mcp__brilliant__session_init`,
`mcp__brilliant__create_entry`, etc.) act as whichever user `bkb use`
last selected.

### One-time wiring

In `~/.claude/settings.json`, replace any existing Brilliant MCP entry
with the launcher:

```jsonc
{
  "mcpServers": {
    "argusskb": {
      "type": "stdio",
      "command": "/Users/<you>/.local/bin/bkb-mcp"
    }
  }
}
```

The key name (`argusskb` here) is the registration name; the
**tool prefix Claude Code uses is the FastMCP server's internal
name** — which is `brilliant` — so the skill's existing
`mcp__brilliant__*` calls still resolve.

Override the MCP repo path or venv with env vars if your layout
differs from `~/xireactor-brilliant/mcp`:

```bash
export BRILLIANT_MCP_REPO=/path/to/xireactor-brilliant/mcp
export BRILLIANT_MCP_PYTHON=/path/to/xireactor-brilliant/mcp/.venv/bin/python
```

### Switching personas

```bash
bkb use sam              # in any terminal
# Then in Claude Code: open a new session, or reload the MCP server
# (the MCP process inherits its env from launch, so a running session
#  keeps the persona it started with).
```

That's the whole loop. Inside Claude Code:

- `bkb whoami` (run as a Bash tool inside the session) tells you which
  persona the next-launched MCP will be.
- The active session's skill will use whichever persona was active
  *when that session started*.
- `bkb use <name>` followed by a new Claude Code session = new persona.

### Why not switch mid-session?

The MCP server is a long-running subprocess Claude Code spawns at
session start and reuses for every tool call. Its env is frozen at
launch. Hot-swapping would require the server to re-read the active
profile per-request — a small patch to `mcp/tools.py`, but not done
here. Restart-on-switch is fine for dev/test work; if you need
parallel personas, register multiple MCP servers (one per persona)
with different launcher wrappers that pin a profile.

### Pinning a profile (for parallel personas)

If you want `sam` and `devon` to coexist as separate MCP servers in
the same session, write per-persona launcher scripts that bypass
`active` and set the env directly:

```bash
# ~/.local/bin/bkb-mcp-sam
#!/usr/bin/env bash
export BRILLIANT_SERVICE_API_KEY="bkai_<sam_key>"
export BRILLIANT_BASE_URL="http://localhost:8010"
exec /Users/<you>/xireactor-brilliant/mcp/.venv/bin/python \
     /Users/<you>/xireactor-brilliant/mcp/server.py
```

Register each as a distinct `mcpServers` entry. Their tools will be
prefixed `mcp__brilliant__*` from each server, but Claude Code
prefixes them with the registered server name (e.g.
`mcp__sam-kb__create_entry`), so the skill — which is hard-coded to
`mcp__brilliant__*` — will only see whichever one is registered under
the FastMCP name `brilliant`. In practice: one active persona at a
time is the simple, working model.

### Troubleshooting

**Skill returns 401** — wrong / revoked key. Run `bkb whoami` to
confirm the active profile authenticates; check
`~/.brilliant-dev/bkb-mcp.log` for which profile/user the last MCP
launch picked up.

**Skill still acts as old user after `bkb use ...`** — the MCP server
is still the one launched with the old env. Start a new Claude Code
session (or reload the MCP via the `/mcp` menu).

**Launcher exits immediately** — check
`~/.brilliant-dev/bkb-mcp.log`. Common causes: no active profile
(`bkb use <name>`); wrong path in `BRILLIANT_MCP_REPO`; the project
venv isn't built yet (`cd ~/xireactor-brilliant/mcp && uv venv
--python 3.12 .venv && uv pip install -r requirements.txt`).

---

## Demo: multi-user flow

End-to-end demo of the role differences using the four provisioned
profiles:

```bash
# Devon files a meeting note as marketing director
bkb use devon
echo "Decisions, action items, who owns what." \
  | bkb entry meeting Meetings/marketing/$(date +%F)-standup "Daily standup" \
    --sensitivity shared --department marketing --tag standup

# Sam (steakhouse GM) comments on it from the F&B side
bkb use sam
bkb comment Meetings/marketing/$(date +%F)-standup "F&B can join 2:15 instead of 2:00"

# Viewer-only account checks visibility
bkb use viewer
bkb search --q standup                       # sees the shared entry
bkb get Decisions/steakhouse/some-private    # 404s on anything still private

# Maria (admin) sees everything
bkb use maria
bkb members
```

---

## File layout

| Path | Purpose |
|------|---------|
| `~/.local/bin/bkb` | The CLI script (executable, stdlib only) |
| `~/.brilliant-dev/credentials.json` | Profiles (api keys, role, email, user_id, notes). chmod 600 |
| `~/.brilliant-dev/active` | One-line file with the active profile name |

You can move the config dir via the `BKB_CONFIG_DIR` env var:

```bash
BKB_CONFIG_DIR=~/.brilliant-staging bkb list
```

This is the clean way to keep separate credential stores per
environment (local / staging / prod).

---

## Troubleshooting

**`no active profile`** — run `bkb use <name>`. If `bkb list` is empty,
register one with `bkb add <name> <key>` or run `bkb provision` as
admin.

**`HTTP 401 Invalid or expired API key`** — wrong key, key revoked, or
pointing at the wrong base URL. Confirm with `bkb whoami` and
`bkb base`.

**`HTTP 500 Internal Server Error` on `bkb zone`** — known server bug
in `routes/zones.py` (ambiguous `id` column). Use `bkb get <path>` to
fetch individual zone entries until that ships fixed.

**Provision skipped a user** — the profile already exists. Re-run with
`--force` to recreate (note: this generates a *new* user via a new
invite; the old API key still exists in the DB but the profile file
will only have the latest).

**Need to point at a different Brilliant instance** — `bkb base <url>`
sets the per-store base URL; or use a per-environment config dir via
`BKB_CONFIG_DIR=...`.

---

## Security notes

- `credentials.json` is chmod 600 and contains live API keys with the
  caller's full role. Do not commit it. Do not share the file. Treat it
  the same way you'd treat a `.env`.
- The four test passwords (`dev-password-1`) are intentionally weak so
  the provisioning flow stays simple. Don't reuse these profiles in any
  shared/staging environment — `bkb invite` + `bkb redeem` with real
  passwords is the right path for anything non-local.
- Service-role keys (with `X-Act-As-User`) aren't currently wrapped by
  the CLI. If you need to test the MCP service-key path, use
  `bkb api …` with a manually constructed header, or extend the script.

---

## Extending

The CLI is one Python file with a flat command structure. To add a
new command:

1. Write a `cmd_xxx(args)` function that calls `api(method, path, body)`
   and prints the result.
2. Add a subparser in `build_parser()`.
3. That's it — no plugin system, no manifest.

`api()` returns `(status_code, parsed_json_or_string)`, and
`resolve_entry(ref)` accepts a UUID or logical path and returns a UUID
— reuse both rather than re-implementing.
