import { useEffect, useMemo, useState } from "react";
import { ApiError, Entry, listEntries } from "../api";
import { go } from "../router";
import { EntryForm } from "../components/EntryForm";
import { notifyMutated, useMutationCounter } from "../mutations";
import { toast } from "../components/Toast";
import {
  BulkProgress,
  bulkAddTag,
  bulkArchive,
  bulkMoveFolder,
} from "../bulkOps";
import { exportSnapshot } from "../export";

// Debounce hook — keeps every keystroke from hitting the API.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function EntryList() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [path, setPath] = useState("");
  const [tag, setTag] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dq = useDebounced(query, 250);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [exporting, setExporting] = useState(false);
  const mutationN = useMutationCounter();

  // Reset to page 0 when any filter changes.
  useEffect(() => setOffset(0), [dq, type, path, tag]);
  // Clear selection whenever the visible set changes.
  useEffect(() => setSelected(new Set()), [dq, type, path, tag, offset, mutationN]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listEntries({
      q: dq || undefined,
      content_type: type || undefined,
      logical_path: path || undefined,
      tag: tag || undefined,
      limit: 50,
      offset,
    })
      .then((r) => {
        if (cancelled) return;
        setRows(r.entries);
        setTotal(r.total);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [dq, type, path, tag, offset, mutationN]);

  // Pull the visible rows' distinct types/folders for the filter dropdowns.
  // For the "all options" lists we'd need a separate fetch; this is "options
  // from current view" which is fine for Phase 2.
  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.content_type))).sort(),
    [rows],
  );

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  async function runBulk(
    op: (entries: Entry[], onP: (p: BulkProgress) => void) => Promise<{ ok: number; failed: number }>,
    label: string,
  ) {
    setBulkProgress({ done: 0, total: selectedRows.length });
    try {
      const res = await op(selectedRows, setBulkProgress);
      if (res.failed === 0) toast.success(`${label}: ${res.ok} entries`);
      else toast.error(`${label}: ${res.ok} ok, ${res.failed} failed`);
      setSelected(new Set());
      notifyMutated();
    } catch (e) {
      toast.error(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
    } finally {
      setBulkProgress(null);
    }
  }

  function bulkTag() {
    const t = window.prompt("Tag to add to selected entries:");
    if (t && t.trim()) runBulk((es, onP) => bulkAddTag(es, t.trim(), onP), `Tagged "${t.trim()}"`);
  }
  function bulkMove() {
    const f = window.prompt("Move selected entries into folder (e.g. archive/2026):");
    if (f && f.trim()) runBulk((es, onP) => bulkMoveFolder(es, f.trim(), onP), "Moved");
  }
  function bulkArchiveSel() {
    if (window.confirm(`Archive ${selectedRows.length} selected entries? This soft-deletes them.`)) {
      runBulk((es, onP) => bulkArchive(es, onP), "Archived");
    }
  }

  async function doExport() {
    setExporting(true);
    try {
      await exportSnapshot();
      toast.success("Snapshot downloaded");
    } catch (e) {
      toast.error(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <button className="btn" onClick={doExport} disabled={exporting}>
          {exporting ? "Exporting…" : "Export HTML"}
        </button>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New entry
        </button>
      </div>
      <div className="filters">
        <input
          className="search-input"
          placeholder="Search titles, content, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          placeholder="Folder prefix (e.g. meetings/2026)"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />
        <input
          placeholder="Tag"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </div>

      {error && <div className="error">{error}</div>}

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="count">{selected.size} selected</span>
          <button className="btn" disabled={!!bulkProgress} onClick={bulkTag}>Add tag</button>
          <button className="btn" disabled={!!bulkProgress} onClick={bulkMove}>Move folder</button>
          <button className="btn danger" disabled={!!bulkProgress} onClick={bulkArchiveSel}>Archive</button>
          {bulkProgress ? (
            <span className="muted">Working {bulkProgress.done}/{bulkProgress.total}…</span>
          ) : (
            <button className="link-btn" onClick={() => setSelected(new Set())}>clear</button>
          )}
        </div>
      )}

      <div className="result-bar">
        <span>
          {loading
            ? "Loading…"
            : `${total.toLocaleString()} ${total === 1 ? "result" : "results"}`}
        </span>
        <span className="pager">
          <button
            className="btn"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            ← Prev
          </button>
          <span className="page-info">
            {offset + 1}–{Math.min(offset + rows.length, total)}
          </span>
          <button
            className="btn"
            disabled={offset + rows.length >= total}
            onClick={() => setOffset(offset + 50)}
          >
            Next →
          </button>
        </span>
      </div>

      <table className="entry-table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleAll}
                aria-label="Select all on page"
              />
            </th>
            <th style={{ width: 110 }}>Type</th>
            <th>Title</th>
            <th style={{ width: 240 }}>Folder</th>
            <th style={{ width: 200 }}>Tags</th>
            <th style={{ width: 100 }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr
              key={e.id}
              className={selected.has(e.id) ? "sel" : ""}
              onClick={() => go({ name: "entry", id: e.id })}
            >
              <td onClick={(ev) => ev.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggleRow(e.id)}
                  aria-label={`Select ${e.title}`}
                />
              </td>
              <td>
                <span className={`card-type t-${e.content_type}`}>{e.content_type}</span>
              </td>
              <td>
                <div className="title">{e.title}</div>
                {e.summary && <div className="summary">{e.summary}</div>}
              </td>
              <td className="path">{e.logical_path}</td>
              <td>
                {(e.tags || []).slice(0, 4).map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
                {(e.tags || []).length > 4 && (
                  <span className="muted">+{(e.tags || []).length - 4}</span>
                )}
              </td>
              <td className="muted">{e.updated_at.slice(0, 10)}</td>
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={6} className="empty">
                No entries match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {creating && (
        <EntryForm
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={(e) => go({ name: "entry", id: e.id })}
        />
      )}
    </>
  );
}
