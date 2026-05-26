import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  Entry,
  GraphResponse,
  TagListResponse,
  getGraph,
  listAllEntries,
  listTags,
} from "../api";

interface DashboardData {
  entries: Entry[];
  totalEntries: number;
  tags: TagListResponse;
  graph: GraphResponse;
}

async function loadAll(): Promise<DashboardData> {
  // Pull a single big page of entries for Phase 1; pagination comes in Phase 2.
  const [entryList, tags, graph] = await Promise.all([
    listAllEntries(2000),
    listTags(),
    getGraph(),
  ]);
  return {
    entries: entryList.entries,
    totalEntries: entryList.total,
    tags,
    graph,
  };
}

function daysAgo(iso: string): number {
  const t = new Date(iso).getTime();
  return (Date.now() - t) / 86_400_000;
}

function countBy<T>(items: T[], key: (x: T) => string): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadAll()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof ApiError) {
          setError(
            e.status === 401
              ? "Unauthorized — set or update your API key in Settings."
              : `API error (${e.status}): ${e.message}`,
          );
        } else {
          setError(String(e));
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const { entries, totalEntries, tags, graph } = data;
    const byType = countBy(entries, (e) => e.content_type);
    const bySens = countBy(entries, (e) => e.sensitivity);
    const updated7d = entries.filter((e) => daysAgo(e.updated_at) <= 7).length;
    const updated30d = entries.filter((e) => daysAgo(e.updated_at) <= 30).length;

    const connected = new Set<string>();
    for (const e of graph.edges) {
      connected.add(e.source);
      connected.add(e.target);
    }
    const orphans = graph.nodes.filter((n) => !connected.has(n.id)).length;

    return {
      totalEntries,
      sampleSize: entries.length,
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      bySens: [...bySens.entries()].sort((a, b) => b[1] - a[1]),
      updated7d,
      updated30d,
      totalTags: tags.total,
      topTags: tags.tags.slice(0, 24),
      totalNodes: graph.total_nodes,
      totalEdges: graph.total_edges,
      orphans,
    };
  }, [data]);

  if (error) return <div className="error">{error}</div>;

  if (loading || !stats) {
    return (
      <div className="grid">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="tile">
            <div className="skeleton" style={{ width: "40%" }} />
            <div className="skeleton" style={{ marginTop: 10, height: 26 }} />
          </div>
        ))}
      </div>
    );
  }

  const maxType = Math.max(...stats.byType.map(([, n]) => n), 1);
  const maxSens = Math.max(...stats.bySens.map(([, n]) => n), 1);

  return (
    <>
      <div className="grid">
        <Tile label="Entries" value={stats.totalEntries} sub={
          stats.sampleSize < stats.totalEntries
            ? `breakdown from sample of ${stats.sampleSize}`
            : "all loaded"
        } />
        <Tile label="Tags" value={stats.totalTags} />
        <Tile label="Graph nodes" value={stats.totalNodes} />
        <Tile label="Graph edges" value={stats.totalEdges} />
        <Tile label="Updated · 7d" value={stats.updated7d} />
        <Tile label="Updated · 30d" value={stats.updated30d} />
        <Tile label="Orphans" value={stats.orphans} sub="no in/out links" />
        <Tile label="Types" value={stats.byType.length} />
      </div>

      <div className="section">
        <h2>By content type</h2>
        {stats.byType.length === 0 ? (
          <div className="empty">No entries</div>
        ) : (
          stats.byType.map(([t, n]) => (
            <div key={t} className="bar-row">
              <span>{t}</span>
              <span className="bar">
                <span style={{ width: `${(n / maxType) * 100}%` }} />
              </span>
              <span className="count">{n}</span>
            </div>
          ))
        )}
      </div>

      <div className="section">
        <h2>By sensitivity</h2>
        {stats.bySens.map(([t, n]) => (
          <div key={t} className="bar-row">
            <span>{t}</span>
            <span className="bar">
              <span style={{ width: `${(n / maxSens) * 100}%` }} />
            </span>
            <span className="count">{n}</span>
          </div>
        ))}
      </div>

      <div className="section">
        <h2>Top tags</h2>
        {stats.topTags.length === 0 ? (
          <div className="empty">No tags</div>
        ) : (
          <div className="tag-cloud">
            {stats.topTags.map((t) => (
              <span key={t.tag} className="tag">
                {t.tag}
                <span className="c">{t.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Tile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="tile">
      <h3>{label}</h3>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
