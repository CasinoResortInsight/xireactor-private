import { useEffect, useMemo, useState } from "react";
import { ApiError, Entry, listEntries } from "../api";
import { go } from "../router";

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

  // Reset to page 0 when any filter changes.
  useEffect(() => setOffset(0), [dq, type, path, tag]);

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
  }, [dq, type, path, tag, offset]);

  // Pull the visible rows' distinct types/folders for the filter dropdowns.
  // For the "all options" lists we'd need a separate fetch; this is "options
  // from current view" which is fine for Phase 2.
  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.content_type))).sort(),
    [rows],
  );

  return (
    <>
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
            <th style={{ width: 110 }}>Type</th>
            <th>Title</th>
            <th style={{ width: 240 }}>Folder</th>
            <th style={{ width: 200 }}>Tags</th>
            <th style={{ width: 100 }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} onClick={() => go({ name: "entry", id: e.id })}>
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
              <td colSpan={5} className="empty">
                No entries match these filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
