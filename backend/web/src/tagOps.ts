// Tag rename / merge are implemented client-side: the main API exposes no
// tag-mutation endpoint, so we fetch every entry carrying the source tag and
// PUT each one with a rewritten tags array. Each write bumps the entry's
// version (sends expected_version, retries once on a 409 race).
//
// This is O(entries-with-tag) requests. Fine for a property-scale KB; if the
// corpus grows large this should move to a dedicated `api/` endpoint.

import { ApiError, Entry, getEntry, listEntries, updateEntry } from "./api";

export interface RetagProgress {
  done: number;
  total: number;
}

export interface RetagResult {
  updated: number;
  failed: number;
  errors: string[];
}

// Rewrite `tags` of a single entry given a transform; retries once on version
// conflict by reloading the entry and recomputing.
async function rewriteEntryTags(
  entry: Entry,
  transform: (tags: string[]) => string[],
): Promise<void> {
  const apply = async (e: Entry) => {
    const next = dedupe(transform(e.tags || []));
    await updateEntry(e.id, { tags: next, expected_version: e.version });
  };
  try {
    await apply(entry);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Lost a version race — reload and try once more.
      const fresh = await getEntry(entry.id);
      await apply(fresh);
    } else {
      throw err;
    }
  }
}

function dedupe(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const v = t.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// Collect every entry carrying `tag` (walks pagination).
async function entriesWithTag(tag: string): Promise<Entry[]> {
  const pageSize = 200;
  const out: Entry[] = [];
  let offset = 0;
  for (;;) {
    const page = await listEntries({ tag, limit: pageSize, offset });
    out.push(...page.entries);
    offset += pageSize;
    if (page.entries.length === 0 || offset >= page.total) break;
  }
  return out;
}

// Replace `from` with `to` everywhere. When `to` already exists on an entry,
// dedupe collapses them — which is exactly "merge". So rename and merge share
// this path; the caller just decides whether `to` is new or existing.
export async function renameOrMergeTag(
  from: string,
  to: string,
  onProgress?: (p: RetagProgress) => void,
): Promise<RetagResult> {
  const entries = await entriesWithTag(from);
  const result: RetagResult = { updated: 0, failed: 0, errors: [] };
  let done = 0;
  for (const entry of entries) {
    try {
      await rewriteEntryTags(entry, (tags) => tags.map((t) => (t === from ? to : t)));
      result.updated++;
    } catch (e) {
      result.failed++;
      const msg = e instanceof ApiError ? `${entry.title}: ${e.message}` : String(e);
      result.errors.push(msg);
    }
    done++;
    onProgress?.({ done, total: entries.length });
  }
  return result;
}

// Remove `tag` from every entry that carries it.
export async function deleteTag(
  tag: string,
  onProgress?: (p: RetagProgress) => void,
): Promise<RetagResult> {
  const entries = await entriesWithTag(tag);
  const result: RetagResult = { updated: 0, failed: 0, errors: [] };
  let done = 0;
  for (const entry of entries) {
    try {
      await rewriteEntryTags(entry, (tags) => tags.filter((t) => t !== tag));
      result.updated++;
    } catch (e) {
      result.failed++;
      const msg = e instanceof ApiError ? `${entry.title}: ${e.message}` : String(e);
      result.errors.push(msg);
    }
    done++;
    onProgress?.({ done, total: entries.length });
  }
  return result;
}
