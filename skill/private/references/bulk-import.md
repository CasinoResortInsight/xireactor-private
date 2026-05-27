# Bulk Ingestion

**Rule of thumb:** < 10 files → per-entry tools (`create_entry` / `submit_staging`).
≥ 10 files from a single coherent source (Obsidian vault, wiki export) → bulk import:
`import_vault_from_blob` on remote, `import_vault` locally.

## Remote MCP (Co-work / Render) — browser upload

**Don't ship a real vault through the MCP protocol.** Claude's per-turn output cap
(~32K tokens ≈ ~100KB) is smaller than a real vault archive (a 1k-file Obsidian vault is
~165KB compressed, ~225KB base64). The base64-over-MCP path only works for toy vaults
under ~50KB tarball.

Direct the user to the browser upload page at `https://<their-api-host>/import/vault`:

- Accepts `.zip` (right-click → Compress on macOS / Send to → Compressed folder on
  Windows) or `.tgz` / `.tar.gz` — server magic-byte sniff routes to the right walker.
- POSTs the archive as multipart — bypasses the MCP protocol, the Co-work bash sandbox
  outbound allowlist, and the per-turn output cap.
- Reuses the same server-side pipeline as `import_vault_from_blob`.
- Renders `{created, staged, batch_id}` inline on success, with the rollback command.
- Auto-attaches the user's API key from `localStorage` (or accepts a paste-in).

What to tell the user:

> "For a vault this size, open `https://<your-api-host>/import/vault` in a browser, drop a
> `.zip` of your vault folder in (right-click → Compress), and submit. I can't stream that
> many bytes through this connection — Claude's per-turn output cap blocks it."

The `/setup` credentials page cross-links to `/import/vault`, so first-time users are
nudged into this flow naturally.

## Small vault / local stdio — blob upload

For small vaults (<~50KB tarball) or local stdio MCP (Claude Code, Claude Desktop):

1. `tar czf /tmp/vault.tgz -C /path/to/vault .` (cap: 25MB compressed / 200MB uncompressed;
   server returns 413 over).
2. `upload_attachment(path="/tmp/vault.tgz")` on local stdio, **or**
   `upload_attachment(content_base64="<base64>", filename="vault.tgz", content_type="application/gzip")`
   for inline bytes — capture `blob_id`.
3. `import_vault_from_blob(blob_id=<blob_id>)` — single blocking call, returns
   `{batch_id, created, staged, linked, errors}`. `.obsidian/**` and `.trash/**` excluded
   by default; pass `excludes=[...]` for more globs.

If the import looks wrong, `rollback_import(batch_id)`.

## Local filesystem path (local MCP only)

`import_vault(path=...)` walks the directory on the MCP process's own filesystem. **Local
MCP only** — not registered on remote Render deploys (use `import_vault_from_blob` there).

- Always run `import_vault(path=..., preview_only=True)` first — returns a collision
  preview (matches by title / logical_path, duplicate candidates). Present it to the user
  before committing.
- On the real run, capture and report the `batch_id`.
- If wrong in retrospect, `rollback_import(batch_id)` — archives imported entries, removes
  created links, purges pending staging items from the batch.

See `references/api-reference.md` §15 for full request/response examples.
