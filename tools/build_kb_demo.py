"""Build a self-contained HTML demo of the knowledge base for the management team.

Pulls all entries from the local API, derives the link graph from
[[wikilink]] and /kb/<id> references in the markdown, and writes a single
HTML file with all data inlined as JSON. Open the file in any browser.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path

import urllib.request

API_BASE = os.environ.get("BRILLIANT_API_BASE", "http://localhost:8010")
API_KEY = os.environ.get(
    "BRILLIANT_API_KEY",
    "bkai_0015_bba18a68227046158708",
)
OUTPUT = Path(__file__).resolve().parent.parent / "kb-demo.html"


def fetch_entries() -> list[dict]:
    req = urllib.request.Request(
        f"{API_BASE}/entries?limit=200",
        headers={"Authorization": f"Bearer {API_KEY}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["entries"]


WIKILINK_RE = re.compile(r"\[\[([^\]\|]+?)\]\]")
KB_LINK_RE = re.compile(r"/kb/([0-9a-f-]{36})")


def derive_links(entries: list[dict]) -> list[dict]:
    """Walk every entry's markdown and emit relationship edges.

    Edges come from two sources:
      - [[handle]] wikilinks resolved against the last segment of each entry's
        logical_path, falling back to a slugified title.
      - /kb/<uuid> markdown links resolved against entry id directly.
    """

    def slug_from_path(path: str) -> str:
        return path.rsplit("/", 1)[-1]

    def title_slug(title: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")

    handle_to_id: dict[str, str] = {}
    for e in entries:
        handle_to_id[slug_from_path(e["logical_path"])] = e["id"]
        handle_to_id.setdefault(title_slug(e["title"]), e["id"])

    known_handles = list(handle_to_id.keys())

    def resolve(handle: str) -> str | None:
        if handle in handle_to_id:
            return handle_to_id[handle]
        # Prefix-match either direction (catches e.g. "snack-bar-refresh-proposal"
        # → path-suffix "snack-bar-refresh"). Pick the longest overlap.
        best: tuple[int, str | None] = (0, None)
        for k in known_handles:
            if handle.startswith(k) or k.startswith(handle):
                score = min(len(handle), len(k))
                if score > best[0]:
                    best = (score, k)
        if best[1] and best[0] >= 6:
            return handle_to_id[best[1]]
        return None

    edges: list[dict] = []
    for e in entries:
        seen: set[tuple[str, str]] = set()
        for handle in WIKILINK_RE.findall(e["content"]):
            handle = handle.strip().lower()
            target = resolve(handle)
            if target and target != e["id"]:
                key = (e["id"], target)
                if key not in seen:
                    seen.add(key)
                    edges.append({"source_id": e["id"], "target_id": target, "via": "wikilink"})
        for uuid in KB_LINK_RE.findall(e["content"]):
            if uuid != e["id"]:
                key = (e["id"], uuid)
                if key not in seen:
                    seen.add(key)
                    edges.append({"source_id": e["id"], "target_id": uuid, "via": "ref"})
    return edges


HTML_TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Knowledge Base — Indian Head Casino · Demo</title>
<style>
  :root {
    --bg: #0e1117;
    --bg-2: #161b22;
    --bg-3: #1f242c;
    --border: #2a313c;
    --text: #e6edf3;
    --muted: #8b949e;
    --accent: #58a6ff;
    --accent-2: #d2a8ff;
    --green: #3fb950;
    --orange: #d29922;
    --red: #f85149;
    --pink: #f778ba;
    --teal: #39c5cf;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #ffffff;
      --bg-2: #f6f8fa;
      --bg-3: #eaeef2;
      --border: #d0d7de;
      --text: #1f2328;
      --muted: #59636e;
      --accent: #0969da;
      --accent-2: #8250df;
      --green: #1a7f37;
      --orange: #9a6700;
      --red: #cf222e;
      --pink: #bf3989;
      --teal: #1b7c83;
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  header.topbar {
    border-bottom: 1px solid var(--border);
    background: var(--bg-2);
    padding: 14px 20px;
    display: flex; align-items: center; gap: 16px;
  }
  header.topbar h1 {
    font-size: 17px; margin: 0; font-weight: 600; letter-spacing: -0.01em;
  }
  header.topbar .subtitle {
    color: var(--muted); font-size: 13px;
  }
  header.topbar .stats {
    margin-left: auto;
    display: flex; gap: 18px;
    color: var(--muted); font-size: 12px;
  }
  header.topbar .stats b { color: var(--text); font-weight: 600; font-size: 14px; }

  .layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    height: calc(100vh - 53px);
  }
  aside.sidebar {
    border-right: 1px solid var(--border);
    background: var(--bg-2);
    overflow-y: auto;
    padding: 16px 14px 80px;
  }
  aside.sidebar h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 18px 0 8px;
    font-weight: 600;
  }
  aside.sidebar h3:first-child { margin-top: 0; }
  .filter-row {
    display: flex; flex-wrap: wrap; gap: 6px;
  }
  .chip {
    font-size: 12px;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--bg-3);
    color: var(--text);
    cursor: pointer;
    user-select: none;
  }
  .chip:hover { border-color: var(--accent); color: var(--accent); }
  .chip.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .chip .count { color: var(--muted); margin-left: 4px; font-variant-numeric: tabular-nums; }
  .chip.active .count { color: rgba(255,255,255,0.85); }

  .tree { font-size: 13px; }
  .tree details { margin: 2px 0; }
  .tree summary {
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    list-style: none;
  }
  .tree summary::-webkit-details-marker { display: none; }
  .tree summary:hover { background: var(--bg-3); }
  .tree summary::before {
    content: "▸";
    display: inline-block;
    width: 14px;
    color: var(--muted);
    transition: transform 0.15s;
  }
  .tree details[open] > summary::before { transform: rotate(90deg); }
  .tree .seg { color: var(--text); font-weight: 500; }
  .tree .seg .count { color: var(--muted); font-weight: 400; font-size: 11px; margin-left: 4px; }
  .tree .leaf {
    margin-left: 18px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--muted);
    display: block;
    text-decoration: none;
    border-left: 2px solid transparent;
  }
  .tree .leaf:hover { background: var(--bg-3); color: var(--text); }
  .tree .leaf.active { color: var(--text); border-left-color: var(--accent); background: var(--bg-3); }

  .search-input {
    width: 100%;
    padding: 7px 10px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font: inherit;
    font-size: 13px;
  }
  .search-input:focus { outline: none; border-color: var(--accent); }

  main.content {
    overflow-y: auto;
    padding: 24px 32px 80px;
  }
  .breadcrumbs {
    color: var(--muted);
    font-size: 12px;
    margin-bottom: 14px;
    display: flex; gap: 8px; align-items: center;
  }
  .breadcrumbs a { color: var(--accent); text-decoration: none; cursor: pointer; }
  .breadcrumbs a:hover { text-decoration: underline; }

  /* Index card grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    gap: 14px;
  }
  .card {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
    position: relative;
  }
  .card:hover { border-color: var(--accent); transform: translateY(-1px); }
  .card .card-type {
    display: inline-block;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .card h2 {
    margin: 0 0 6px;
    font-size: 15px;
    line-height: 1.35;
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  .card p.summary {
    margin: 0 0 10px;
    color: var(--muted);
    font-size: 12.5px;
    line-height: 1.5;
  }
  .card .meta {
    display: flex; gap: 10px; flex-wrap: wrap;
    color: var(--muted); font-size: 11px;
  }
  .card .meta .path { font-family: ui-monospace, SFMono-Regular, monospace; }
  .card .tags { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
  .card .tag {
    font-size: 10.5px;
    padding: 1px 6px;
    border-radius: 4px;
    background: var(--bg-3);
    color: var(--muted);
  }
  .card .link-count {
    position: absolute;
    top: 12px; right: 14px;
    font-size: 11px;
    color: var(--muted);
  }
  .card .link-count b { color: var(--accent); }

  /* Type colors */
  .t-daily        { background: rgba(63,185,80,0.18);  color: var(--green); }
  .t-meeting      { background: rgba(210,153,34,0.18); color: var(--orange); }
  .t-project      { background: rgba(210,168,255,0.18); color: var(--accent-2); }
  .t-decision     { background: rgba(248,81,73,0.18);  color: var(--red); }
  .t-intelligence { background: rgba(57,197,207,0.18); color: var(--teal); }

  /* Entry detail */
  .entry-detail {
    max-width: 900px;
    display: grid;
    grid-template-columns: 1fr 260px;
    gap: 32px;
    align-items: start;
  }
  .entry-body { min-width: 0; }
  .entry-meta {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    font-size: 12.5px;
    position: sticky; top: 0;
  }
  .entry-meta h4 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 14px 0 6px;
    font-weight: 600;
  }
  .entry-meta h4:first-child { margin-top: 0; }
  .entry-meta dl { margin: 0; }
  .entry-meta dt { color: var(--muted); font-size: 11px; }
  .entry-meta dd { margin: 0 0 8px; word-break: break-word; }
  .entry-meta dd.path { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; }
  .entry-meta ul { list-style: none; margin: 0; padding: 0; }
  .entry-meta li { margin: 4px 0; }
  .entry-meta li a {
    color: var(--text);
    text-decoration: none;
    display: block;
    padding: 5px 7px;
    border-radius: 4px;
    border-left: 2px solid var(--accent);
    background: var(--bg-3);
    font-size: 12px;
    line-height: 1.35;
  }
  .entry-meta li a:hover { background: var(--border); }
  .entry-meta li a .ltype {
    display: block;
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 2px;
  }

  .entry-body h1 {
    font-size: 26px;
    margin: 0 0 8px;
    line-height: 1.2;
    letter-spacing: -0.015em;
  }
  .entry-body h2 {
    font-size: 18px;
    margin: 26px 0 10px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--border);
  }
  .entry-body h3 { font-size: 15px; margin: 20px 0 6px; }
  .entry-body p, .entry-body ul, .entry-body ol { margin: 0 0 12px; }
  .entry-body ul, .entry-body ol { padding-left: 24px; }
  .entry-body li { margin: 4px 0; }
  .entry-body code {
    background: var(--bg-3);
    padding: 1.5px 5px;
    border-radius: 3px;
    font-size: 90%;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }
  .entry-body table {
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;
    width: 100%;
  }
  .entry-body th, .entry-body td {
    border: 1px solid var(--border);
    padding: 5px 10px;
    text-align: left;
  }
  .entry-body th { background: var(--bg-3); font-weight: 600; }
  .entry-body td.num, .entry-body th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .entry-body a { color: var(--accent); text-decoration: none; }
  .entry-body a:hover { text-decoration: underline; }
  .entry-body a.wikilink {
    color: var(--accent-2);
    background: rgba(210,168,255,0.10);
    padding: 0 4px;
    border-radius: 3px;
  }
  .entry-body a.wikilink.broken {
    color: var(--muted);
    background: transparent;
    border-bottom: 1px dotted var(--muted);
    cursor: not-allowed;
  }
  .entry-body hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 22px 0;
  }
  .entry-body blockquote {
    border-left: 3px solid var(--border);
    margin: 12px 0;
    padding: 4px 14px;
    color: var(--muted);
  }

  .sensitivity-badge {
    display: inline-block;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
    margin-left: 8px;
    vertical-align: middle;
  }
  .s-operational { background: var(--bg-3); color: var(--muted); }
  .s-project     { background: rgba(210,168,255,0.18); color: var(--accent-2); }
  .s-strategic   { background: rgba(57,197,207,0.18); color: var(--teal); }
  .s-private     { background: rgba(248,81,73,0.22); color: var(--red); }

  .empty {
    color: var(--muted);
    text-align: center;
    padding: 60px 20px;
    font-size: 14px;
  }

  /* Mini graph */
  .graph-section {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 22px;
  }
  .graph-section h3 {
    margin: 0 0 10px;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .graph-section p {
    margin: 0 0 8px;
    font-size: 12.5px;
    color: var(--muted);
  }
  svg.graph { width: 100%; height: 380px; display: block; }
  svg.graph .node circle {
    cursor: pointer;
    stroke-width: 1.5;
    transition: r 0.15s;
  }
  svg.graph .node:hover circle { stroke: var(--accent); stroke-width: 2.5; }
  svg.graph .node text {
    fill: var(--text);
    font-size: 10.5px;
    pointer-events: none;
  }
  svg.graph line.edge {
    stroke: var(--border);
    stroke-width: 1;
  }

  details.helpbox {
    background: var(--bg-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 18px;
    font-size: 13px;
  }
  details.helpbox summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--text);
  }
  details.helpbox p { margin: 8px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  details.helpbox kbd {
    background: var(--bg-3);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 11.5px;
    font-family: ui-monospace, monospace;
  }

  @media (max-width: 900px) {
    .layout { grid-template-columns: 220px 1fr; }
    aside.sidebar { padding: 12px 10px 60px; }
    main.content { padding: 18px 18px 60px; }
    .entry-detail { grid-template-columns: 1fr; }
    .entry-meta { position: static; }
    header.topbar { flex-wrap: wrap; gap: 8px 16px; padding: 10px 14px; }
    header.topbar .subtitle { width: 100%; order: 3; }
    header.topbar .stats { margin-left: 0; }
    .grid { grid-template-columns: 1fr; }
    svg.graph { height: 320px; }
  }
</style>
</head>
<body>

<header class="topbar">
  <h1>Knowledge Base · Indian Head Casino</h1>
  <span class="subtitle">demo for management — view what entries look like, and how they connect</span>
  <div class="stats">
    <div><b id="stat-entries">—</b> entries</div>
    <div><b id="stat-types">—</b> types</div>
    <div><b id="stat-tags">—</b> tags</div>
    <div><b id="stat-links">—</b> links</div>
  </div>
</header>

<div class="layout">
  <aside class="sidebar">
    <input id="search" class="search-input" type="search" placeholder="Search titles, content, tags…" />
    <h3>Content type</h3>
    <div id="filter-types" class="filter-row"></div>
    <h3>Folders (logical path)</h3>
    <div id="tree" class="tree"></div>
    <h3>Top tags</h3>
    <div id="filter-tags" class="filter-row"></div>
  </aside>

  <main class="content" id="main">
    <!-- rendered by JS -->
  </main>
</div>

<script type="application/json" id="kb-data">__KB_DATA__</script>
<script>
(function () {
  "use strict";

  const data = JSON.parse(document.getElementById("kb-data").textContent);
  const entries = data.entries;
  const edges = data.edges;

  // Build lookups.
  const byId = Object.fromEntries(entries.map(e => [e.id, e]));
  const outgoing = {};
  const incoming = {};
  for (const e of entries) { outgoing[e.id] = []; incoming[e.id] = []; }
  for (const edge of edges) {
    outgoing[edge.source_id].push(edge);
    incoming[edge.target_id].push(edge);
  }

  // Tag counts.
  const tagCounts = {};
  for (const e of entries) for (const t of (e.tags || [])) tagCounts[t] = (tagCounts[t] || 0) + 1;
  // Type counts.
  const typeCounts = {};
  for (const e of entries) typeCounts[e.content_type] = (typeCounts[e.content_type] || 0) + 1;

  // Render top stats.
  document.getElementById("stat-entries").textContent = entries.length;
  document.getElementById("stat-types").textContent = Object.keys(typeCounts).length;
  document.getElementById("stat-tags").textContent = Object.keys(tagCounts).length;
  document.getElementById("stat-links").textContent = edges.length;

  // State.
  const state = {
    activeType: null,
    activeTag: null,
    activePath: null,
    search: "",
  };

  // --- Filters UI ---
  function renderTypeFilters() {
    const root = document.getElementById("filter-types");
    root.innerHTML = "";
    const types = Object.keys(typeCounts).sort((a,b) => typeCounts[b]-typeCounts[a]);
    for (const t of types) {
      const el = document.createElement("span");
      el.className = "chip" + (state.activeType === t ? " active" : "");
      el.innerHTML = `${t}<span class="count">${typeCounts[t]}</span>`;
      el.onclick = () => { state.activeType = state.activeType === t ? null : t; goIndex(); };
      root.appendChild(el);
    }
  }
  function renderTagFilters() {
    const root = document.getElementById("filter-tags");
    root.innerHTML = "";
    const tags = Object.keys(tagCounts)
      .filter(t => tagCounts[t] >= 2)
      .sort((a,b) => tagCounts[b]-tagCounts[a]);
    for (const t of tags) {
      const el = document.createElement("span");
      el.className = "chip" + (state.activeTag === t ? " active" : "");
      el.innerHTML = `${t}<span class="count">${tagCounts[t]}</span>`;
      el.onclick = () => { state.activeTag = state.activeTag === t ? null : t; goIndex(); };
      root.appendChild(el);
    }
  }

  // --- Folder tree ---
  function buildTree() {
    const root = { children: {}, entries: [] };
    for (const e of entries) {
      const parts = e.logical_path.split("/");
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node.children[seg]) node.children[seg] = { children: {}, entries: [] };
        node = node.children[seg];
      }
      node.entries.push(e);
    }
    return root;
  }
  function renderTree() {
    const root = document.getElementById("tree");
    root.innerHTML = "";
    const tree = buildTree();
    function render(node, path, container, level) {
      const segs = Object.keys(node.children).sort();
      for (const seg of segs) {
        const child = node.children[seg];
        const segPath = path ? path + "/" + seg : seg;
        const count = countNode(child);
        const details = document.createElement("details");
        if (level === 0) details.open = true;
        const summary = document.createElement("summary");
        summary.innerHTML = `<span class="seg">${escapeHtml(seg)}<span class="count">${count}</span></span>`;
        details.appendChild(summary);
        const childContainer = document.createElement("div");
        render(child, segPath, childContainer, level + 1);
        details.appendChild(childContainer);
        container.appendChild(details);
      }
      // leaf entries at this level
      for (const e of node.entries.sort((a,b) => a.title.localeCompare(b.title))) {
        const a = document.createElement("a");
        a.className = "leaf";
        a.href = "#/entry/" + e.id;
        a.textContent = e.title;
        container.appendChild(a);
      }
    }
    function countNode(n) {
      let c = n.entries.length;
      for (const k of Object.keys(n.children)) c += countNode(n.children[k]);
      return c;
    }
    render(tree, "", root, 0);
  }

  // --- Filtering ---
  function applyFilters(list) {
    return list.filter(e => {
      if (state.activeType && e.content_type !== state.activeType) return false;
      if (state.activeTag && !(e.tags || []).includes(state.activeTag)) return false;
      if (state.search) {
        const s = state.search.toLowerCase();
        const hay = (e.title + " " + (e.summary || "") + " " + e.content + " " + (e.tags||[]).join(" ")).toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }

  // --- Routing ---
  function go() {
    const hash = location.hash.replace(/^#\/?/, "");
    if (hash.startsWith("entry/")) {
      const id = hash.slice("entry/".length);
      renderEntry(id);
    } else {
      renderIndex();
    }
    renderTypeFilters();
    renderTagFilters();
    renderTree();
  }
  function goIndex() { location.hash = "#/"; renderIndex(); renderTypeFilters(); renderTagFilters(); }

  // --- Index view ---
  function renderIndex() {
    const main = document.getElementById("main");
    const list = applyFilters(entries);
    list.sort((a,b) => b.updated_at.localeCompare(a.updated_at));

    const filterBadges = [];
    if (state.activeType) filterBadges.push(`<span class="chip active">type: ${state.activeType} <span class="count">×</span></span>`);
    if (state.activeTag) filterBadges.push(`<span class="chip active">tag: ${state.activeTag} <span class="count">×</span></span>`);
    if (state.search) filterBadges.push(`<span class="chip active">search: ${escapeHtml(state.search)}</span>`);

    let html = `
      <div class="breadcrumbs">
        <span>All entries</span>
        <span>·</span>
        <span>${list.length} of ${entries.length}</span>
      </div>

      <details class="helpbox">
        <summary>What this demo shows</summary>
        <p>
          This is a static snapshot of the live knowledge base — every entry is real,
          published content from the property's daily operations.
          Each <b>card</b> below is one entry. The <b>color tag</b> at the top of each card is the entry's
          <i>content type</i> (daily log, meeting note, project, decision, intelligence).
          The <b>path</b> in monospace is the entry's folder in the KB hierarchy. The <b>chips</b> are tags.
          The number in the top-right shows how many other entries this one links to or is linked from.
          Click any card to read the full entry, see related entries, and follow links.
        </p>
        <p>
          Use the left sidebar to filter by content type, by folder, by tag, or use
          <kbd>search</kbd> to query across all titles and content.
        </p>
      </details>

      <div class="graph-section">
        <h3>Link graph</h3>
        <p>
          Entries are nodes. A line means one entry references another — either by a
          markdown link or by a <code>[[wikilink]]</code> handle.
          Color = content type. Click any node to open that entry.
        </p>
        <svg class="graph" id="graph"></svg>
      </div>

      ${filterBadges.length ? `<div class="filter-row" style="margin-bottom:14px">${filterBadges.join("")}</div>` : ""}

      ${list.length === 0
        ? `<div class="empty">No entries match the current filters.</div>`
        : `<div class="grid">${list.map(renderCard).join("")}</div>`}
    `;
    main.innerHTML = html;

    renderGraph();
  }

  function renderCard(e) {
    const linkCount = outgoing[e.id].length + incoming[e.id].length;
    const tagsHtml = (e.tags || []).slice(0, 5).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("");
    return `
      <a class="card" href="#/entry/${e.id}" style="text-decoration:none;color:inherit;display:block">
        <span class="card-type t-${e.content_type}">${e.content_type}</span>
        ${e.sensitivity && e.sensitivity !== "operational" ? `<span class="sensitivity-badge s-${e.sensitivity}">${e.sensitivity}</span>` : ""}
        <div class="link-count">${linkCount > 0 ? `<b>${linkCount}</b> link${linkCount===1?"":"s"}` : ""}</div>
        <h2>${escapeHtml(decodeEntities(e.title))}</h2>
        <p class="summary">${escapeHtml(e.summary || "")}</p>
        <div class="meta">
          <span class="path">${escapeHtml(e.logical_path)}</span>
          <span>·</span>
          <span>${e.updated_at.slice(0,10)}</span>
        </div>
        <div class="tags">${tagsHtml}</div>
      </a>
    `;
  }

  // --- Entry detail view ---
  function renderEntry(id) {
    const main = document.getElementById("main");
    const e = byId[id];
    if (!e) {
      main.innerHTML = `<div class="empty">Entry not found. <a href="#/">Back to index</a></div>`;
      return;
    }
    const out = outgoing[id];
    const inc = incoming[id];

    main.innerHTML = `
      <div class="breadcrumbs">
        <a href="#/">All entries</a>
        <span>·</span>
        <span class="path" style="font-family:ui-monospace,monospace">${escapeHtml(e.logical_path)}</span>
      </div>

      <div class="entry-detail">
        <div class="entry-body" id="entry-body"></div>

        <div class="entry-meta">
          <h4>Type</h4>
          <dd><span class="card-type t-${e.content_type}">${e.content_type}</span></dd>

          <h4>Sensitivity</h4>
          <dd><span class="sensitivity-badge s-${e.sensitivity}">${e.sensitivity}</span></dd>

          <h4>Folder</h4>
          <dd class="path">${escapeHtml(e.logical_path)}</dd>

          <h4>Updated</h4>
          <dd>${e.updated_at.slice(0,10)} (v${e.version})</dd>

          <h4>Tags</h4>
          <dd>
            <div class="tags" style="display:flex;flex-wrap:wrap;gap:4px">
              ${(e.tags || []).map(t => `<span class="tag" style="padding:2px 8px;border-radius:999px;background:var(--bg-3);color:var(--muted);font-size:11px">${escapeHtml(t)}</span>`).join("")}
            </div>
          </dd>

          ${out.length > 0 ? `
            <h4>Links to (${out.length})</h4>
            <ul>
              ${out.map(edge => {
                const target = byId[edge.target_id];
                if (!target) return "";
                return `<li><a href="#/entry/${target.id}"><span class="ltype">${target.content_type} · ${edge.via}</span>${escapeHtml(decodeEntities(target.title))}</a></li>`;
              }).join("")}
            </ul>
          ` : ""}

          ${inc.length > 0 ? `
            <h4>Linked from (${inc.length})</h4>
            <ul>
              ${inc.map(edge => {
                const source = byId[edge.source_id];
                if (!source) return "";
                return `<li><a href="#/entry/${source.id}"><span class="ltype">${source.content_type} · ${edge.via}</span>${escapeHtml(decodeEntities(source.title))}</a></li>`;
              }).join("")}
            </ul>
          ` : ""}
        </div>
      </div>
    `;
    document.getElementById("entry-body").innerHTML = renderMarkdown(e.content, e.id);
    window.scrollTo(0, 0);
    document.querySelector("main.content").scrollTo(0, 0);
  }

  // --- Link graph (force layout, very small) ---
  function renderGraph() {
    const svg = document.getElementById("graph");
    if (!svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const width = svg.clientWidth;
    const height = svg.clientHeight;

    // Only show entries with at least one edge to reduce clutter.
    const connected = new Set();
    for (const ed of edges) { connected.add(ed.source_id); connected.add(ed.target_id); }
    const nodes = entries.filter(e => connected.has(e.id)).map(e => ({
      id: e.id, title: e.title, type: e.content_type,
      x: width/2 + (Math.random()-0.5) * width * 0.6,
      y: height/2 + (Math.random()-0.5) * height * 0.6,
      vx: 0, vy: 0,
    }));
    const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
    const links = edges.filter(ed => nodeMap[ed.source_id] && nodeMap[ed.target_id]);

    // Simple force simulation.
    const ITERS = 220;
    const REPEL = 1800;
    const SPRING = 0.012;
    const SPRING_LEN = 90;
    const DAMP = 0.86;
    const CENTER = 0.005;

    for (let iter = 0; iter < ITERS; iter++) {
      for (const a of nodes) {
        let fx = (width/2 - a.x) * CENTER;
        let fy = (height/2 - a.y) * CENTER;
        for (const b of nodes) {
          if (a === b) continue;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx*dx + dy*dy + 0.01;
          const f = REPEL / d2;
          fx += dx / Math.sqrt(d2) * f;
          fy += dy / Math.sqrt(d2) * f;
        }
        a.vx = (a.vx + fx) * DAMP;
        a.vy = (a.vy + fy) * DAMP;
      }
      for (const l of links) {
        const a = nodeMap[l.source_id], b = nodeMap[l.target_id];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx*dx + dy*dy) + 0.01;
        const f = SPRING * (d - SPRING_LEN);
        const ux = dx/d, uy = dy/d;
        a.vx += ux * f; a.vy += uy * f;
        b.vx -= ux * f; b.vy -= uy * f;
      }
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(30, Math.min(width - 30, n.x));
        n.y = Math.max(20, Math.min(height - 20, n.y));
      }
    }

    // Color by type.
    const typeColors = {
      daily: "#3fb950",
      meeting: "#d29922",
      project: "#d2a8ff",
      decision: "#f85149",
      intelligence: "#39c5cf",
    };

    let s = "";
    for (const l of links) {
      const a = nodeMap[l.source_id], b = nodeMap[l.target_id];
      s += `<line class="edge" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
    }
    for (const n of nodes) {
      const c = typeColors[n.type] || "#8b949e";
      const r = 5 + Math.min(8, (outgoing[n.id].length + incoming[n.id].length));
      const label = n.title.length > 32 ? n.title.slice(0, 30) + "…" : n.title;
      s += `<g class="node" onclick="location.hash='#/entry/${n.id}'">
        <circle cx="${n.x}" cy="${n.y}" r="${r}" fill="${c}" fill-opacity="0.75" stroke="${c}"></circle>
        <text x="${n.x + r + 4}" y="${n.y + 3}">${escapeHtml(decodeEntities(label))}</text>
      </g>`;
    }
    svg.innerHTML = s;
  }

  // --- Markdown rendering (minimal, custom — no CDN) ---
  function renderMarkdown(md, ownerId) {
    // Normalize line endings.
    md = md.replace(/\r\n?/g, "\n");

    // Decode the few entities the source uses (e.g. &amp;).
    md = decodeEntities(md);

    // Code spans first (so we can put the placeholders back at the end).
    const codes = [];
    md = md.replace(/`([^`\n]+?)`/g, (_, code) => {
      codes.push(code);
      return `CODE${codes.length-1}`;
    });

    // Escape HTML on the remaining content.
    md = escapeHtml(md);

    // Tables.
    md = md.replace(/((?:^\|.*\n)+)/gm, (block) => {
      const lines = block.trim().split("\n");
      if (lines.length < 2) return block;
      // separator row check
      const sep = lines[1];
      if (!/^\|[\s\-:|]+\|$/.test(sep.trim())) return block;
      const header = splitRow(lines[0]);
      const align = splitRow(sep).map(c => {
        c = c.trim();
        if (c.startsWith(":") && c.endsWith(":")) return "center";
        if (c.endsWith(":")) return "right";
        return "left";
      });
      const rows = lines.slice(2).map(splitRow);
      let html = "<table><thead><tr>";
      for (let i = 0; i < header.length; i++) {
        html += `<th class="${align[i]==='right'?'num':''}" style="text-align:${align[i]}">${header[i]}</th>`;
      }
      html += "</tr></thead><tbody>";
      for (const r of rows) {
        html += "<tr>";
        for (let i = 0; i < r.length; i++) {
          html += `<td class="${align[i]==='right'?'num':''}" style="text-align:${align[i]}">${r[i]}</td>`;
        }
        html += "</tr>";
      }
      html += "</tbody></table>";
      return html + "\n";
    });
    function splitRow(line) {
      let l = line.trim();
      if (l.startsWith("|")) l = l.slice(1);
      if (l.endsWith("|")) l = l.slice(0, -1);
      return l.split("|").map(c => c.trim());
    }

    // Headings.
    md = md.replace(/^###### (.*)$/gm, "<h6>$1</h6>");
    md = md.replace(/^##### (.*)$/gm, "<h5>$1</h5>");
    md = md.replace(/^#### (.*)$/gm, "<h4>$1</h4>");
    md = md.replace(/^### (.*)$/gm, "<h3>$1</h3>");
    md = md.replace(/^## (.*)$/gm, "<h2>$1</h2>");
    md = md.replace(/^# (.*)$/gm, "<h1>$1</h1>");

    // Horizontal rules.
    md = md.replace(/^---+$/gm, "<hr />");

    // Bullet lists. Group consecutive lines starting with "- " or "* ".
    md = md.replace(/(?:^[-*] .*(?:\n|$))+?/gm, (block) => {
      const items = block.trim().split("\n").map(l => l.replace(/^[-*] /, ""));
      return "<ul>" + items.map(i => `<li>${i}</li>`).join("") + "</ul>\n";
    });
    // Numbered lists.
    md = md.replace(/(?:^\d+\. .*(?:\n|$))+?/gm, (block) => {
      const items = block.trim().split("\n").map(l => l.replace(/^\d+\. /, ""));
      return "<ol>" + items.map(i => `<li>${i}</li>`).join("") + "</ol>\n";
    });

    // Bold and italic.
    md = md.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
    md = md.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");

    // Markdown links [text](url). Treat /kb/<id> as internal nav.
    md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => {
      const m = url.match(/^\/kb\/([0-9a-f-]{36})/);
      if (m) {
        const t = byId[m[1]];
        return `<a class="wikilink" href="#/entry/${m[1]}">${text}${t ? "" : ""}</a>`;
      }
      const safe = url.replace(/"/g, "&quot;");
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    // Wikilinks [[handle]]. Resolve via the same handle map the build uses.
    md = md.replace(/\[\[([^\]\|]+?)\]\]/g, (_, raw) => {
      const handle = raw.trim().toLowerCase();
      const targetId = resolveHandle(handle);
      if (targetId) {
        const t = byId[targetId];
        return `<a class="wikilink" href="#/entry/${targetId}">${escapeHtml(decodeEntities(t.title))}</a>`;
      }
      return `<span class="wikilink broken" title="No entry matches this handle">${escapeHtml(raw)}</span>`;
    });

    // Paragraphs: wrap orphan text blocks.
    const parts = md.split(/\n{2,}/);
    md = parts.map(p => {
      const t = p.trim();
      if (!t) return "";
      // Already an HTML block?
      if (/^<(h\d|ul|ol|table|hr|blockquote|p|div)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
    }).join("\n");

    // Restore code spans.
    md = md.replace(/CODE(\d+)/g, (_, i) => `<code>${escapeHtml(codes[+i])}</code>`);

    return md;
  }

  // Build the wikilink resolver client-side too.
  const handleMap = (function () {
    const m = {};
    for (const e of entries) {
      const last = e.logical_path.split("/").pop();
      if (last) m[last.toLowerCase()] = e.id;
      const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!(slug in m)) m[slug] = e.id;
    }
    return m;
  })();
  const handleKeys = Object.keys(handleMap);
  function resolveHandle(handle) {
    if (handle in handleMap) return handleMap[handle];
    let best = { score: 0, key: null };
    for (const k of handleKeys) {
      if (handle.startsWith(k) || k.startsWith(handle)) {
        const score = Math.min(handle.length, k.length);
        if (score > best.score) best = { score, key: k };
      }
    }
    if (best.key && best.score >= 6) return handleMap[best.key];
    return null;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function decodeEntities(s) {
    return String(s)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  // Search wiring.
  document.getElementById("search").addEventListener("input", (ev) => {
    state.search = ev.target.value.trim();
    if (location.hash.startsWith("#/entry/")) location.hash = "#/";
    else renderIndex();
  });

  window.addEventListener("hashchange", go);
  go();
})();
</script>
</body>
</html>
"""


def build() -> None:
    entries = fetch_entries()
    edges = derive_links(entries)
    payload = {"entries": entries, "edges": edges}
    blob = json.dumps(payload, ensure_ascii=False)
    if "</script" in blob:
        blob = blob.replace("</script", "<\\/script")
    html = HTML_TEMPLATE.replace("__KB_DATA__", blob)
    OUTPUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUTPUT} — {len(entries)} entries, {len(edges)} edges, {len(html):,} bytes")


if __name__ == "__main__":
    build()
