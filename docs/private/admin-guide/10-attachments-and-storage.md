# 10 — Attachments & Storage

> File handling, storage backends, and what to back up.

**Who this is for:** the admin choosing where blobs live and planning for backup.

The deep technical reference for the attachment subsystem is [docs/ATTACHMENTS.md](../ATTACHMENTS.md). This page is the admin-lens summary on top of it.

## What's an attachment

Brilliant treats binary files (PDFs, images, vault tarballs, small documents) as first-class blobs. The `blobs` table stores metadata; the bytes live in either the local filesystem or an S3-compatible bucket depending on `STORAGE_BACKEND`.

Each blob has:

- A **content hash** (sha-256). Identical bytes uploaded twice produce one row; the second upload increments a refcount.
- A **content type** (MIME).
- An **owning entry** (when attached to a specific entry) or none (orphan upload, e.g. a vault tarball mid-import).
- A **signed download URL** — HMAC-signed by `LOCAL_STORAGE_SIGNING_KEY` (local) or via S3 presigning (s3).

PDFs additionally get a "PDF digest" — page count, first-page text excerpt, etc. — extracted on upload for later search and preview.

## Choosing a backend

`STORAGE_BACKEND` selects between two backends. Both share the same blobs table; only the bytes layer differs.

### `local` (default)

- **Where it writes:** `LOCAL_STORAGE_ROOT` (default `/data/uploads`), under content-hash-prefix subdirectories.
- **Render:** the 1 GB persistent disk is mounted at `/data` — blobs live there.
- **Pros:** zero-config, no external dependencies.
- **Cons:** sized by the disk; doesn't scale horizontally; you back up the volume.
- **When to use:** small teams, < 1 GB of attachments, single-host deployments.

### `s3` (S3-compatible)

- Works with AWS S3, Cloudflare R2, Backblaze B2, MinIO, etc.
- The api uses standard S3 env vars (endpoint, region, bucket, access key, secret).
- Download URLs use S3 presigning.
- **Pros:** unbounded capacity, easier backup story (versioned bucket), survives container churn.
- **Cons:** a bit more config; a network hop on every upload/download.
- **When to use:** multi-host, anything beyond ~1 GB of attachments, anything you want versioned at the storage layer.

See [docs/ATTACHMENTS.md](../ATTACHMENTS.md) for the canonical env-var list and bucket-policy examples.

## Switching backends

The data does **not** auto-migrate. Plan a migration:

1. Pick a low-traffic window.
2. Stop the api (or put it in read-only mode).
3. Sync existing blobs from `LOCAL_STORAGE_ROOT` to the new bucket, preserving the content-hash-keyed layout.
4. Update `STORAGE_BACKEND` and the S3 env vars.
5. Restart the api.

Without step 3, existing entries with attachments will return broken download URLs.

## Dedup and refcounting

Identical bytes — by sha-256 — produce one row in `blobs` with an incrementing reference count. When an entry that owns a blob is deleted, the refcount decrements; when it hits zero, the blob is eligible for cleanup.

Cleanup of zero-ref blobs is **not automatic in the running api** — there's no GC loop today. Operationally, schedule a periodic sweep:

```sql
SELECT id, content_hash, size_bytes
FROM blobs
WHERE refcount = 0 AND created_at < now() - interval '7 days';
```

Confirm and delete the rows + the underlying files / S3 objects. Hold the 7-day grace window so freshly-deleted entries can be restored without orphan-blob loss.

## Permissions on attachments

Attachment access inherits from the owning entry. If a user can read the entry (RLS-scoped), they get a signed URL. If they can't, the api returns 404 (not 403 — the entry is invisible to them).

## What to back up

The complete backup set is:

1. **Postgres** — the source of truth for everything except blob bytes.
   ```bash
   pg_dump --format=custom $DATABASE_URL > brilliant-$(date +%F).dump
   ```
2. **Blob storage** — depends on backend:
   - `local`: snapshot or `rsync` `LOCAL_STORAGE_ROOT` (default `/data/uploads`).
   - `s3`: enable bucket versioning + lifecycle policy. (No app-level backup needed.)
3. **Secrets** — `OAUTH_HANDOFF_SECRET`, `BRILLIANT_SERVICE_API_KEY`, OAuth client secret, `LOCAL_STORAGE_SIGNING_KEY`. Keep these in your password manager / secret store. Rotating them while a backup is in flight is fine; the old secrets aren't needed to restore.

### Recovery test

Periodically run a recovery dry-run:

1. Restore `pg_dump` into a throwaway Postgres.
2. Start a fresh api/mcp pair pointing at the restored DB.
3. Sync the blob volume (or point at the same S3 bucket read-only).
4. Hit `/health`, list a few entries, fetch one with an attachment.

If any of those steps fail, your backup story has a gap.

## Sizing

Rough numbers from the project's defaults:

- **PDF average:** ~500 KB. 1 GB disk holds ~2,000 PDFs. Plan for S3 if you ingest at any meaningful rate.
- **Vault tarballs:** typical 1k-file Obsidian vault is ~165 KB compressed, ~2 MB uncompressed. The 25 MB / 200 MB caps cover most real-world vaults.
- **Embeddings:** stored in Postgres on the entries themselves (`pgvector` 1536d). About 6 KB per entry. 100K entries ≈ 600 MB just for embeddings — factor into your DB sizing.

## See also

- [docs/ATTACHMENTS.md](../ATTACHMENTS.md) — canonical reference for the attachment pipeline, S3 env vars, dedup, signing.
- [11-observability-and-ops.md](11-observability-and-ops.md) — backup and upgrade detail.
- [04-configuration.md](04-configuration.md) — `STORAGE_BACKEND` and related env vars.
