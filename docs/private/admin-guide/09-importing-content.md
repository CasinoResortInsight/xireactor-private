# 09 — Importing Content

> Three import paths. Pick by where you're running and how big the source is.

**Who this is for:** the admin loading existing notes, an Obsidian vault, or a wiki export into a fresh Brilliant.

## The three paths at a glance

| Path | When to use | Where it runs | Size cap |
|---|---|---|---|
| **Browser upload** at `/import/vault` | Most cases. Especially anything > ~50 KB compressed. | Anywhere reachable from your browser. | 25 MB compressed / 200 MB uncompressed (server returns 413 over). |
| **MCP `import_vault_from_blob`** | Co-work / remote MCP, programmatic flows, small (≤ 50KB) tarballs | Any client | Same caps. |
| **MCP `import_vault(path=...)`** | Local stdio MCP only (Claude Code, Claude Desktop) | Local file path on the MCP host | Same caps. **Not registered on Render.** |

The CLI helper [tools/vault_import.py](../../tools/vault_import.py) wraps the import endpoints for direct command-line use.

## The browser upload — the recommended path

The first-party `/import/vault` page is the canonical bulk path. It bypasses Claude's per-turn output cap and the Co-work bash sandbox entirely.

### How it works

1. Visit `https://<your-api-host>/import/vault`.
2. The page auto-attaches your API key from `localStorage` (or accepts a paste-in if missing).
3. Drop a `.zip`, `.tgz`, or `.tar.gz` of your vault folder. macOS: right-click → Compress. Windows: Send to → Compressed folder.
4. Submit. The api walks the archive server-side (magic-byte sniff), runs the same pipeline as `import_vault`, and renders the result inline:

   ```
   { "created": 247, "staged": 18, "linked": 412, "batch_id": "abc-...", "errors": [] }
   ```

5. The page also prints the `rollback_import(batch_id)` command so you can undo.

### What the importer does per file

For each markdown file:

1. Strip YAML frontmatter (preserved into `domain_meta` where applicable).
2. Parse `[[wiki-link]]` references into pending link rows.
3. Auto-route by inferred content type (or default to `resource`).
4. Compute `logical_path` from the file's relative path within the vault.
5. Insert into `entries` with the originating `import_batches` row.
6. Sync `entry_links` so wiki-links resolve immediately on read.

Excluded by default: `.obsidian/**`, `.trash/**`. Pass `excludes=[...]` to add globs (via the API or MCP forms; the browser page uses defaults).

## MCP path 1 — `import_vault_from_blob` (works from Co-work)

When you want to drive the import from Claude (e.g. "import this vault for me") rather than the browser. Three steps:

```
# 1) Make a tarball locally
tar czf /tmp/vault.tgz -C /path/to/vault .

# 2) Upload as a blob
upload_attachment(path="/tmp/vault.tgz")
# → { blob_id: "...", ... }

# 3) Trigger the import
import_vault_from_blob(blob_id="...")
# → { batch_id, created, staged, linked, errors }
```

Caveats:

- `upload_attachment(path=...)` only works on **local stdio MCP** (the MCP process must be able to read the file). For remote MCP, use `upload_attachment(content_base64=..., filename=..., content_type=...)` — practical ceiling ~50KB because of Claude's per-turn output cap.
- For real vaults (anything bigger than a couple hundred files), the browser path is materially better. The MCP is rate-limited by Claude's protocol; the browser is not.

## MCP path 2 — `import_vault(path=...)` (local MCP only)

For Claude Code / Desktop with the MCP running on your filesystem.

### Always preview first

```
import_vault(path="/path/to/vault", preview_only=True)
```

Returns a collision summary: matches by title, by logical_path, duplicate candidates. Read it before committing.

### Real run

```
import_vault(path="/path/to/vault")
# → { batch_id, ... }
```

Capture the `batch_id`. Report it to the user. If the import looks wrong:

```
rollback_import(batch_id="...")
```

## Rollback

Rollback is supported on every import path:

- **Archives the imported entries** — they get marked deleted (the archive policy preserves them in the database; not a hard delete).
- **Removes created links** — `entry_links` rows added by the import are dropped.
- **Purges pending staging items from the batch** — anything that landed in staging via the import is cleared.

Rollback is keyed by `batch_id`. Hold onto the IDs from successful imports until you're confident the data is what you wanted.

## CLI: `tools/vault_import.py`

Wraps the import endpoints for ops use. From the repo root:

```bash
python tools/vault_import.py --help
```

Useful for cron'd imports or scripted ingestion from a watched directory. See [tools/vault_import.py](../../tools/vault_import.py) for current options.

## Common ingestion patterns

### Importing an Obsidian vault

1. Compress the vault folder (right-click → Compress, or `tar czf vault.tgz vault/`).
2. Browser-upload at `/import/vault`.
3. Review the `created` / `staged` / `linked` counts.
4. Spot-check 3–5 entries via `GET /entries/{id}` — wiki-links should render as clickable references, not literal `[[slug]]`.
5. Save the `batch_id` in case rollback is needed.

### Importing a flat folder of markdown files

Same as above. The importer is content-type-agnostic; missing content_type defaults to `resource`. Add tags or restructure paths post-import if needed.

### Re-importing after rollback

If you fix the source and re-import, you'll get a fresh `batch_id`. The old archived entries remain in the database (admin-visible); they don't conflict with the new import.

## What can go wrong

| Symptom | Cause | Fix |
|---|---|---|
| **413 Payload Too Large** | Tarball over 25 MB compressed or 200 MB uncompressed. | Split into multiple tarballs, or trim non-essential files (images, attachments) before compressing. |
| **`[[wiki-links]]` render literal** post-import | Link sync didn't run on the imported entries. Rare — usually a code path issue. | Re-save one of the affected entries via `update_entry` to retrigger `sync_entry_links`. |
| **Imports show `staged` items** | Import was run with an agent key. Agent writes go through staging by design. | Use an interactive (`web_ui`) admin/editor key to import, or accept that items will need governance approval. |
| **Lots of `errors` in the result** | Frontmatter parse failures, unsupported file types, or duplicate `logical_path`. | Open the per-file errors in the response; fix source files; re-run on the failed subset. |

## See also

- [10-attachments-and-storage.md](10-attachments-and-storage.md) — what happens to PDFs and binary files in your vault.
- [08-content-and-search.md](08-content-and-search.md) — how content_type and tags affect post-import discoverability.
- [11-observability-and-ops.md](11-observability-and-ops.md) — auditing imports via `import_batches`.
