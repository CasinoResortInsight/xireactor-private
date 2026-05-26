// Bulk operations over a set of selected entries. Like tagOps, these are
// client-side fan-outs of single-entry writes (the API has no batch endpoint),
// each sending expected_version with a one-shot reload+retry on a 409 race.

import { ApiError, Entry, deleteEntry, getEntry, updateEntry } from "./api";

export interface BulkProgress {
  done: number;
  total: number;
}

export interface BulkResult {
  ok: number;
  failed: number;
  errors: string[];
}

async function forEachEntry(
  entries: Entry[],
  fn: (e: Entry) => Promise<void>,
  onProgress?: (p: BulkProgress) => void,
): Promise<BulkResult> {
  const result: BulkResult = { ok: 0, failed: 0, errors: [] };
  let done = 0;
  for (const entry of entries) {
    try {
      await fn(entry);
      result.ok++;
    } catch (e) {
      result.failed++;
      result.errors.push(e instanceof ApiError ? `${entry.title}: ${e.message}` : String(e));
    }
    done++;
    onProgress?.({ done, total: entries.length });
  }
  return result;
}

// Apply a tags-transforming update with a single 409 retry.
async function updateTagsWithRetry(entry: Entry, transform: (tags: string[]) => string[]) {
  const apply = async (e: Entry) => {
    const next = dedupe(transform(e.tags || []));
    await updateEntry(e.id, { tags: next, expected_version: e.version });
  };
  try {
    await apply(entry);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      await apply(await getEntry(entry.id));
    } else throw err;
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

export const bulkAddTag = (entries: Entry[], tag: string, onP?: (p: BulkProgress) => void) =>
  forEachEntry(entries, (e) => updateTagsWithRetry(e, (tags) => [...tags, tag]), onP);

export const bulkRemoveTag = (entries: Entry[], tag: string, onP?: (p: BulkProgress) => void) =>
  forEachEntry(entries, (e) => updateTagsWithRetry(e, (tags) => tags.filter((t) => t !== tag)), onP);

// Move entries into `targetFolder`, preserving each entry's leaf segment so
// "meetings/2026/05/foo" moved to "archive/2026" becomes "archive/2026/foo".
export const bulkMoveFolder = (entries: Entry[], targetFolder: string, onP?: (p: BulkProgress) => void) => {
  const folder = targetFolder.replace(/\/+$/, "");
  return forEachEntry(
    entries,
    async (e) => {
      const leaf = e.logical_path.split("/").pop() || e.id;
      const next = `${folder}/${leaf}`;
      const apply = async (entry: Entry) =>
        updateEntry(entry.id, { logical_path: next, expected_version: entry.version });
      try {
        await apply(e);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) await apply(await getEntry(e.id));
        else throw err;
      }
    },
    onP,
  );
};

export const bulkArchive = (entries: Entry[], onP?: (p: BulkProgress) => void) =>
  forEachEntry(entries, (e) => deleteEntry(e.id).then(() => undefined), onP);
