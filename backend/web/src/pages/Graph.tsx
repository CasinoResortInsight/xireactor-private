// Full-page interactive link graph. cytoscape handles pan/zoom and layout;
// we wire it to /graph for nodes+edges, color by content_type, click-to-open,
// and a "focus on neighbors" mode that fades everything outside the
// selected node's 1-hop neighborhood.

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core, ElementDefinition } from "cytoscape";
import { ApiError, GraphResponse } from "../api";
import { getGraphCached } from "../cache";
import { useMutationCounter } from "../mutations";

// Same color map the demo / dashboard use, kept in sync by eye.
const TYPE_COLORS: Record<string, string> = {
  daily: "#3fb950",
  meeting: "#d29922",
  project: "#d2a8ff",
  decision: "#f85149",
  intelligence: "#39c5cf",
};
const DEFAULT_COLOR = "#8b949e";

export function Graph() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [focusId, setFocusId] = useState<string | null>(null);
  const mutationN = useMutationCounter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getGraphCached()
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof ApiError ? `API ${e.status}: ${e.message}` : String(e));
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [mutationN]);

  const typeOptions = useMemo(() => {
    if (!graph) return [];
    return Array.from(new Set(graph.nodes.map((n) => n.content_type))).sort();
  }, [graph]);

  // (Re)build cytoscape whenever the underlying data changes.
  useEffect(() => {
    if (!graph || !containerRef.current) return;

    const elements: ElementDefinition[] = [
      ...graph.nodes.map((n) => ({
        data: {
          id: n.id,
          label: n.title.length > 36 ? n.title.slice(0, 34) + "…" : n.title,
          ctype: n.content_type,
          color: TYPE_COLORS[n.content_type] || DEFAULT_COLOR,
        },
      })),
      ...graph.edges.map((e, i) => ({
        data: { id: `e${i}`, source: e.source, target: e.target, ltype: e.link_type },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            "font-size": 10,
            color: "#e6edf3",
            "text-outline-color": "#0e1117",
            "text-outline-width": 2,
            "text-valign": "center",
            "text-halign": "right",
            "text-margin-x": 4,
            width: "mapData(degree, 0, 20, 14, 38)",
            height: "mapData(degree, 0, 20, 14, 38)",
            "border-width": 1,
            "border-color": "data(color)",
            "border-opacity": 0.8,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#2a313c",
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": "#2a313c",
            "arrow-scale": 0.7,
          },
        },
        {
          selector: ".faded",
          style: { opacity: 0.12 },
        },
        {
          selector: ".highlight",
          style: { "line-color": "#58a6ff", "target-arrow-color": "#58a6ff", width: 2 },
        },
        {
          selector: "node.focus",
          style: { "border-color": "#58a6ff", "border-width": 3, "border-opacity": 1 },
        },
      ],
      layout: { name: "cose", animate: false, idealEdgeLength: 90, nodeRepulsion: 4500 } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.25,
      minZoom: 0.1,
      maxZoom: 3,
    });

    // Annotate degree for sizing.
    cy.nodes().forEach((n) => {
      n.data("degree", n.connectedEdges().length);
    });
    cy.style().update();

    cy.on("tap", "node", (evt) => {
      const id = evt.target.id();
      if (evt.originalEvent.shiftKey) {
        // Shift-click = focus mode toggle
        setFocusId((curr) => (curr === id ? null : id));
      } else {
        location.hash = `#/entries/${id}`;
      }
    });
    cy.on("tap", (evt) => {
      // Tap on empty canvas clears focus.
      if (evt.target === cy) setFocusId(null);
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  // Apply filter + focus styling whenever those change.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.elements().removeClass("faded highlight focus");

      if (typeFilter) {
        cy.nodes().forEach((n) => {
          if (n.data("ctype") !== typeFilter) n.addClass("faded");
        });
        cy.edges().forEach((e) => {
          if (e.source().hasClass("faded") || e.target().hasClass("faded")) {
            e.addClass("faded");
          }
        });
      }

      if (focusId) {
        const node = cy.getElementById(focusId);
        if (node.nonempty()) {
          const neighborhood = node.closedNeighborhood();
          cy.elements().difference(neighborhood).addClass("faded");
          neighborhood.removeClass("faded");
          node.addClass("focus");
          node.connectedEdges().addClass("highlight");
        }
      }
    });
  }, [typeFilter, focusId, graph]);

  if (loading && !graph) {
    return <div className="empty">Loading graph…</div>;
  }
  if (error) return <div className="error">{error}</div>;
  if (!graph) return null;
  if (graph.nodes.length === 0) {
    return <div className="empty">This knowledge base has no entries yet — nothing to graph.</div>;
  }

  const focusedTitle = focusId
    ? graph.nodes.find((n) => n.id === focusId)?.title || null
    : null;

  return (
    <div className="graph-page">
      <div className="graph-toolbar">
        <div className="graph-stats">
          <b>{graph.total_nodes}</b> nodes ·{" "}
          <b>{graph.total_edges}</b> edges
          {graph.truncated && <span className="muted"> · truncated</span>}
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {focusedTitle && (
          <span className="focus-pill">
            Focus: <b>{focusedTitle}</b>
            <button className="x" onClick={() => setFocusId(null)} title="Clear focus">×</button>
          </span>
        )}

        <span className="hint">
          Click a node to open · shift-click to focus on its neighbors
        </span>
      </div>

      <div ref={containerRef} className="graph-canvas" />

      <div className="graph-legend">
        {Object.entries(TYPE_COLORS).map(([t, c]) => (
          <span key={t} className="legend-item">
            <span className="dot" style={{ background: c }} />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
