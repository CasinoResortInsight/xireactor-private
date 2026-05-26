// Activity log — the API has no dedicated audit endpoint, so we reconstruct a
// recent-changes feed from what's observable: entries ordered by updated_at
// DESC (carrying updated_by + version) plus the most recent staging
// submissions. Good enough to answer "what changed lately, and who touched
// it"; a true append-only audit trail would need a new api/ endpoint.

import { useEffect, useState } from "react";
import { ApiError, Entry, StagingItem, listEntries, listStaging } from "../api";

interface Feed {
  entries: Entry[];
  staging: StagingItem[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function Activity() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listEntries({ limit: 50, offset: 0 }), // default order = updated_at DESC
      listStaging("pending").catch(() => ({ items: [], total: 0 })),
    ])
      .then(([entries, staging]) => {
        if (cancelled) return;
        setFeed({ entries: entries.entries, staging: staging.items.slice(0, 25) });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (loading || !feed) return <div className="empty">Loading…</div>;

  return (
    <>
      <p className="page-note">
        Reconstructed from recent entry updates and the pending staging queue —
        the API has no append-only audit log. "Updated by" reflects the last
        writer on each entry.
      </p>

      {feed.staging.length > 0 && (
        <div className="section">
          <h2>Pending review ({feed.staging.length})</h2>
          <table className="entry-table">
            <tbody>
              {feed.staging.map((s) => (
                <tr key={s.id}>
                  <td style={{ width: 90 }}>
                    <span className={`card-type t-${s.change_type}`}>{s.change_type}</span>
                  </td>
                  <td>{s.proposed_title || <span className="muted">(untitled)</span>}</td>
                  <td className="path">{s.target_path}</td>
                  <td className="muted" style={{ width: 140 }}>{s.submitted_by}</td>
                  <td className="muted" style={{ width: 90 }}>{timeAgo(s.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section">
        <h2>Recently updated entries</h2>
        <table className="entry-table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Type</th>
              <th>Title</th>
              <th style={{ width: 140 }}>Updated by</th>
              <th style={{ width: 60 }} className="num">Ver</th>
              <th style={{ width: 90 }}>When</th>
            </tr>
          </thead>
          <tbody>
            {feed.entries.map((e) => (
              <tr
                key={e.id}
                onClick={() => (location.hash = `#/entries/${e.id}`)}
                style={{ cursor: "pointer" }}
              >
                <td>
                  <span className={`card-type t-${e.content_type}`}>{e.content_type}</span>
                </td>
                <td>
                  <div className="title">{e.title}</div>
                  <div className="path">{e.logical_path}</div>
                </td>
                <td className="muted">{e.updated_by || "—"}</td>
                <td className="num muted">{e.version}</td>
                <td className="muted">{timeAgo(e.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
