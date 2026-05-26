// Minimal markdown renderer, ported from tools/build_kb_demo.py to TypeScript.
// Deliberately small: no CDN, no heavy lib, deterministic output. Handles the
// subset the KB actually uses: headings, bold/italic, ul/ol, tables, code spans,
// blockquotes, hr, links, [[wikilinks]], and /kb/<uuid> internal nav.

export interface MarkdownContext {
  // Resolve a wikilink handle (lowercased) to an entry id, or null if unknown.
  resolveHandle: (handle: string) => string | null;
  // Resolve an entry id to its display title (used to label both wikilinks and
  // /kb/<id> links if the original text was the bare id).
  titleFor: (id: string) => string | null;
}

export function renderMarkdown(md: string, ctx: MarkdownContext): string {
  md = md.replace(/\r\n?/g, "\n");
  md = decodeEntities(md);

  // Pull out code spans first so their content survives escaping intact.
  const codes: string[] = [];
  md = md.replace(/`([^`\n]+?)`/g, (_, code: string) => {
    codes.push(code);
    return `\x00CODE${codes.length - 1}\x00`;
  });

  md = escapeHtml(md);

  // Tables.
  md = md.replace(/((?:^\|.*\n)+)/gm, (block: string) => {
    const lines = block.trim().split("\n");
    if (lines.length < 2) return block;
    const sep = lines[1].trim();
    if (!/^\|[\s\-:|]+\|$/.test(sep)) return block;
    const split = (line: string) => {
      let l = line.trim();
      if (l.startsWith("|")) l = l.slice(1);
      if (l.endsWith("|")) l = l.slice(0, -1);
      return l.split("|").map((c) => c.trim());
    };
    const header = split(lines[0]);
    const align = split(sep).map((c) => {
      const t = c.trim();
      if (t.startsWith(":") && t.endsWith(":")) return "center";
      if (t.endsWith(":")) return "right";
      return "left";
    });
    const rows = lines.slice(2).map(split);
    const cell = (tag: "th" | "td", text: string, a: string) =>
      `<${tag} class="${a === "right" ? "num" : ""}" style="text-align:${a}">${text}</${tag}>`;
    const head = "<tr>" + header.map((h, i) => cell("th", h, align[i])).join("") + "</tr>";
    const body = rows
      .map((r) => "<tr>" + r.map((c, i) => cell("td", c, align[i])).join("") + "</tr>")
      .join("");
    return `<table><thead>${head}</thead><tbody>${body}</tbody></table>\n`;
  });

  // Headings.
  for (let n = 6; n >= 1; n--) {
    const re = new RegExp(`^${"#".repeat(n)} (.*)$`, "gm");
    md = md.replace(re, `<h${n}>$1</h${n}>`);
  }

  md = md.replace(/^---+$/gm, "<hr />");

  // Lists.
  md = md.replace(/(?:^[-*] .*(?:\n|$))+?/gm, (block) => {
    const items = block.trim().split("\n").map((l) => l.replace(/^[-*] /, ""));
    return "<ul>" + items.map((i) => `<li>${i}</li>`).join("") + "</ul>\n";
  });
  md = md.replace(/(?:^\d+\. .*(?:\n|$))+?/gm, (block) => {
    const items = block.trim().split("\n").map((l) => l.replace(/^\d+\. /, ""));
    return "<ol>" + items.map((i) => `<li>${i}</li>`).join("") + "</ol>\n";
  });

  // Bold and italic.
  md = md.replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>");
  md = md.replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,!?]|$)/g, "$1<em>$2</em>");

  // Markdown links — treat /kb/<uuid> as internal nav.
  md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text: string, url: string) => {
    const m = url.match(/^\/kb\/([0-9a-fA-F-]{36})/);
    if (m) return `<a class="wikilink" href="#/entries/${m[1]}">${text}</a>`;
    const safe = url.replace(/"/g, "&quot;");
    return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // Wikilinks [[handle]].
  md = md.replace(/\[\[([^\]\|]+?)\]\]/g, (_, raw: string) => {
    const handle = raw.trim().toLowerCase();
    const id = ctx.resolveHandle(handle);
    if (id) {
      const title = ctx.titleFor(id) || raw;
      return `<a class="wikilink" href="#/entries/${id}">${escapeHtml(title)}</a>`;
    }
    return `<span class="wikilink broken" title="No entry matches this handle">${escapeHtml(raw)}</span>`;
  });

  // Paragraphs.
  md = md
    .split(/\n{2,}/)
    .map((p) => {
      const t = p.trim();
      if (!t) return "";
      if (/^<(h\d|ul|ol|table|hr|blockquote|p|div)/.test(t)) return t;
      return `<p>${t.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  // Restore code spans.
  md = md.replace(/\x00CODE(\d+)\x00/g, (_, i: string) => `<code>${escapeHtml(codes[+i])}</code>`);

  return md;
}

export function buildHandleResolver(entries: { id: string; title: string; logical_path: string }[]) {
  const map: Record<string, string> = {};
  const titles: Record<string, string> = {};
  for (const e of entries) {
    titles[e.id] = e.title;
    const last = e.logical_path.split("/").pop();
    if (last) map[last.toLowerCase()] = e.id;
    const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!(slug in map)) map[slug] = e.id;
  }
  const keys = Object.keys(map);
  return {
    resolveHandle: (handle: string): string | null => {
      if (handle in map) return map[handle];
      let best = { score: 0, key: null as string | null };
      for (const k of keys) {
        if (handle.startsWith(k) || k.startsWith(handle)) {
          const score = Math.min(handle.length, k.length);
          if (score > best.score) best = { score, key: k };
        }
      }
      return best.key && best.score >= 6 ? map[best.key] : null;
    },
    titleFor: (id: string) => titles[id] || null,
  };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeEntities(s: string): string {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
