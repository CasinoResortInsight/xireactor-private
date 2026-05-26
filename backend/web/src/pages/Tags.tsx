// Tags admin — list tags with counts, inspect co-occurrence, and rename /
// merge / delete tags. Rename and merge are client-side bulk rewrites (see
// tagOps.ts) because the API has no tag-mutation endpoint.

import { useEffect, useMemo, useState } from "react";
import { ApiError, TagCoOccurrence, TagWithCount, coOccurringTags, listTags } from "../api";
import { RetagProgress, deleteTag, renameOrMergeTag } from "../tagOps";
import { notifyMutated, useMutationCounter } from "../mutations";
import { toast } from "../components/Toast";
import { isAdmin, useIdentity } from "../identity";

type Pending =
  | { kind: "rename"; tag: string }
  | { kind: "merge"; tag: string }
  | { kind: "delete"; tag: string };

export function Tags() {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [cooc, setCooc] = useState<TagCoOccurrence[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [target, setTarget] = useState("");
  const [progress, setProgress] = useState<RetagProgress | null>(null);
  const mutationN = useMutationCounter();
  const admin = isAdmin(useIdentity());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listTags()
      .then((r) => !cancelled && setTags(r.tags))
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mutationN]);

  // Load co-occurrence when a tag is selected.
  useEffect(() => {
    if (!selected) {
      setCooc(null);
      return;
    }
    let cancelled = false;
    setCooc(null);
    coOccurringTags(selected, 15)
      .then((r) => !cancelled && setCooc(r.neighbors))
      .catch(() => !cancelled && setCooc([]));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? tags.filter((t) => t.tag.toLowerCase().includes(f)) : tags;
  }, [tags, filter]);

  function startOp(kind: Pending["kind"], tag: string) {
    setPending({ kind, tag } as Pending);
    setTarget(kind === "rename" ? tag : "");
  }

  async function runOp() {
    if (!pending) return;
    const { kind, tag } = pending;

    if (kind !== "delete") {
      const to = target.trim();
      if (!to) return toast.error("Enter a target tag name.");
      if (to === tag) return toast.error("New name is identical.");
    }

    setProgress({ done: 0, total: 0 });
    try {
      const result =
        kind === "delete"
          ? await deleteTag(tag, setProgress)
          : await renameOrMergeTag(tag, target.trim(), setProgress);

      const verb = kind === "delete" ? "Removed from" : kind === "merge" ? "Merged across" : "Renamed across";
      if (result.failed === 0) {
        toast.success(`${verb} ${result.updated} entries`);
      } else {
        toast.error(`${verb} ${result.updated}; ${result.failed} failed`);
      }
      setPending(null);
      setSelected(null);
      notifyMutated();
    } catch (e) {
      toast.error(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
    } finally {
      setProgress(null);
    }
  }

  if (error) return <div className="error">{error}</div>;

  return (
    <>
      <div className="tags-layout">
        <div>
          <input
            className="search-input"
            placeholder="Filter tags…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
          {loading ? (
            <div className="empty">Loading…</div>
          ) : (
            <table className="entry-table tags-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th style={{ width: 70 }} className="num">Count</th>
                  <th style={{ width: 220 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr
                    key={t.tag}
                    className={selected === t.tag ? "sel" : ""}
                    onClick={() => setSelected(t.tag)}
                  >
                    <td>{t.tag}</td>
                    <td className="num muted">{t.count}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {admin ? (
                        <>
                          <button className="link-btn" onClick={() => startOp("rename", t.tag)}>rename</button>
                          <button className="link-btn" onClick={() => startOp("merge", t.tag)}>merge</button>
                          <button className="link-btn danger" onClick={() => startOp("delete", t.tag)}>delete</button>
                        </>
                      ) : (
                        <span className="muted small">admin only</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={3} className="empty">No tags match.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <aside className="tags-side">
          {selected ? (
            <>
              <h4>Co-occurs with “{selected}”</h4>
              {cooc === null ? (
                <div className="muted small">Loading…</div>
              ) : cooc.length === 0 ? (
                <div className="muted small">No co-occurring tags.</div>
              ) : (
                <ul className="cooc-list">
                  {cooc.map((c) => (
                    <li key={c.tag} onClick={() => setSelected(c.tag)}>
                      <span>{c.tag}</span>
                      <span className="muted">
                        {c.co_count}× · j={c.jaccard.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="muted small">Select a tag to see what it co-occurs with.</div>
          )}
        </aside>
      </div>

      {pending && (
        <>
          <div className="drawer-backdrop" onClick={() => !progress && setPending(null)} />
          <div className="modal" role="dialog">
            <h2>
              {pending.kind === "rename" && `Rename “${pending.tag}”`}
              {pending.kind === "merge" && `Merge “${pending.tag}” into…`}
              {pending.kind === "delete" && `Delete “${pending.tag}”`}
            </h2>

            {pending.kind === "delete" ? (
              <p>
                Remove the tag <b>{pending.tag}</b> from every entry that carries
                it. Each affected entry is rewritten (version bumps). This can't
                be undone in bulk.
              </p>
            ) : (
              <>
                <p>
                  {pending.kind === "merge"
                    ? "Every entry tagged with the source tag will instead carry the target tag (duplicates collapse)."
                    : "Rewrite this tag across every entry that carries it."}{" "}
                  Each affected entry is rewritten and its version bumps.
                </p>
                <label>Target tag</label>
                <input
                  autoFocus
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={pending.kind === "merge" ? "existing tag to merge into" : "new tag name"}
                  list="all-tags"
                />
                <datalist id="all-tags">
                  {tags.map((t) => (
                    <option key={t.tag} value={t.tag} />
                  ))}
                </datalist>
              </>
            )}

            {progress && (
              <div className="progress">
                Rewriting {progress.done}/{progress.total || "…"} entries…
              </div>
            )}

            <div className="actions">
              <button className="btn" disabled={!!progress} onClick={() => setPending(null)}>
                Cancel
              </button>
              <button
                className={`btn ${pending.kind === "delete" ? "danger" : "primary"}`}
                disabled={!!progress}
                onClick={runOp}
              >
                {progress
                  ? "Working…"
                  : pending.kind === "rename"
                    ? "Rename"
                    : pending.kind === "merge"
                      ? "Merge"
                      : "Delete"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
