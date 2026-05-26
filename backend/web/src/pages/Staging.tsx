// Staging review — surfaces the API's /staging queue so an admin can approve
// (promote to a live entry) or reject queued submissions. Approving a "create"
// item produces a new entry; approving an "update" item applies the proposed
// change to the target entry.

import { useEffect, useState } from "react";
import {
  ApiError,
  StagingItem,
  approveStaging,
  listStaging,
  rejectStaging,
} from "../api";
import { buildHandleResolver, renderMarkdown } from "../markdown";
import { notifyMutated, useMutationCounter } from "../mutations";
import { toast } from "../components/Toast";
import { isAdmin, useIdentity } from "../identity";

const STATUSES = ["pending", "approved", "rejected"];

// Render proposed markdown with a no-op wikilink resolver — staging previews
// don't need cross-entry resolution.
const previewResolver = buildHandleResolver([]);

export function Staging() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState<StagingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const mutationN = useMutationCounter();
  const identity = useIdentity();
  const admin = isAdmin(identity);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listStaging(status)
      .then((r) => {
        if (cancelled) return;
        setItems(r.items);
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
  }, [status, mutationN]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function act(item: StagingItem, kind: "approve" | "reject") {
    let reason: string | undefined;
    if (kind === "reject") {
      const r = window.prompt("Reason for rejecting (optional):") ?? undefined;
      reason = r || undefined;
    }
    setBusyId(item.id);
    try {
      if (kind === "approve") {
        await approveStaging(item.id, reason);
        toast.success(`Approved "${item.proposed_title || item.target_path}"`);
      } else {
        await rejectStaging(item.id, reason);
        toast.success("Rejected");
      }
      notifyMutated(); // refreshes both this queue and the entry list
    } catch (e) {
      const msg = e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="filter-row" style={{ marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <span
            key={s}
            className={`chip ${status === s ? "active" : ""}`}
            onClick={() => setStatus(s)}
          >
            {s}
            {status === s && <span className="count">{total}</span>}
          </span>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">No {status} staging items.</div>
      ) : (
        <div className="staging-list">
          {items.map((item) => {
            const isOpen = expanded.has(item.id);
            return (
              <div key={item.id} className="staging-card">
                <div className="staging-head">
                  <div>
                    <span className={`card-type t-${item.change_type}`}>{item.change_type}</span>
                    <span className="tier">tier {item.governance_tier}</span>
                    <span className="muted"> · {item.submission_category}</span>
                  </div>
                  <div className="muted">{item.created_at.slice(0, 10)}</div>
                </div>

                <h3>{item.proposed_title || <span className="muted">(no title)</span>}</h3>
                <div className="path">{item.target_path}</div>
                <div className="muted small">
                  submitted by {item.submitted_by} · via {item.source}
                  {item.target_entry_id && (
                    <>
                      {" · "}
                      <a href={`#/entries/${item.target_entry_id}`}>view target entry</a>
                    </>
                  )}
                </div>

                {item.proposed_content && (
                  <>
                    <button className="link-btn" onClick={() => toggle(item.id)}>
                      {isOpen ? "Hide" : "Show"} proposed content
                    </button>
                    {isOpen && (
                      <div
                        className="staging-preview entry-body"
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(item.proposed_content, previewResolver),
                        }}
                      />
                    )}
                  </>
                )}

                {status === "pending" &&
                  (admin ? (
                    <div className="staging-actions">
                      <button
                        className="btn primary"
                        disabled={busyId === item.id}
                        onClick={() => act(item, "approve")}
                      >
                        {busyId === item.id ? "…" : "Approve"}
                      </button>
                      <button
                        className="btn danger"
                        disabled={busyId === item.id}
                        onClick={() => act(item, "reject")}
                      >
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="muted small" style={{ marginTop: 10 }}>
                      Approving / rejecting requires an admin key.
                    </div>
                  ))}

                {item.promoted_entry_id && (
                  <div className="muted small">
                    → promoted to{" "}
                    <a href={`#/entries/${item.promoted_entry_id}`}>entry</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
