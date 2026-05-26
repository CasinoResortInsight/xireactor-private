import { useEffect, useMemo, useState } from "react";
import { ApiError, Entry, GraphResponse, getEntry } from "../api";
import { getAllEntriesCached, getGraphCached } from "../cache";
import { buildHandleResolver, renderMarkdown } from "../markdown";

interface DetailData {
  entry: Entry;
  allEntries: Entry[];
  graph: GraphResponse;
}

export function EntryDetail({ id }: { id: string }) {
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([getEntry(id), getAllEntriesCached(), getGraphCached()])
      .then(([entry, allEntries, graph]) => {
        if (!cancelled) setData({ entry, allEntries, graph });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const resolver = useMemo(
    () => (data ? buildHandleResolver(data.allEntries) : null),
    [data],
  );

  const links = useMemo(() => {
    if (!data) return { out: [], inc: [] };
    const byId = new Map(data.allEntries.map((e) => [e.id, e] as const));
    const out: { target: Entry; type: string }[] = [];
    const inc: { source: Entry; type: string }[] = [];
    for (const ed of data.graph.edges) {
      if (ed.source === id) {
        const t = byId.get(ed.target);
        if (t) out.push({ target: t, type: ed.link_type });
      } else if (ed.target === id) {
        const s = byId.get(ed.source);
        if (s) inc.push({ source: s, type: ed.link_type });
      }
    }
    return { out, inc };
  }, [data, id]);

  if (loading) return <div className="empty">Loading…</div>;
  if (error) return <div className="error">{error}</div>;
  if (!data || !resolver) return null;

  const { entry } = data;
  const html = renderMarkdown(entry.content, resolver);

  return (
    <>
      <div className="breadcrumbs">
        <a href="#/entries">All entries</a>
        <span>·</span>
        <span className="path">{entry.logical_path}</span>
      </div>

      <div className="entry-detail">
        <div className="entry-body">
          <h1>
            {entry.title}
            {entry.sensitivity && entry.sensitivity !== "operational" && (
              <span className={`sensitivity-badge s-${entry.sensitivity}`}>
                {entry.sensitivity}
              </span>
            )}
          </h1>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>

        <aside className="entry-meta">
          <h4>Type</h4>
          <div>
            <span className={`card-type t-${entry.content_type}`}>{entry.content_type}</span>
          </div>

          <h4>Sensitivity</h4>
          <div>
            <span className={`sensitivity-badge s-${entry.sensitivity}`}>{entry.sensitivity}</span>
          </div>

          <h4>Folder</h4>
          <div className="path">{entry.logical_path}</div>

          <h4>Updated</h4>
          <div>
            {entry.updated_at.slice(0, 10)} (v{entry.version})
          </div>

          {entry.tags && entry.tags.length > 0 && (
            <>
              <h4>Tags</h4>
              <div className="tag-cloud">
                {entry.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </>
          )}

          {links.out.length > 0 && (
            <>
              <h4>Links to ({links.out.length})</h4>
              <ul className="link-rail">
                {links.out.map(({ target, type }, i) => (
                  <li key={i}>
                    <a href={`#/entries/${target.id}`}>
                      <span className="ltype">
                        {target.content_type} · {type}
                      </span>
                      {target.title}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          {links.inc.length > 0 && (
            <>
              <h4>Linked from ({links.inc.length})</h4>
              <ul className="link-rail">
                {links.inc.map(({ source, type }, i) => (
                  <li key={i}>
                    <a href={`#/entries/${source.id}`}>
                      <span className="ltype">
                        {source.content_type} · {type}
                      </span>
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
