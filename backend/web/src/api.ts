import { getApiKey } from "./auth";

// All requests go through the local FastAPI proxy at /api/*, which forwards
// to BRILLIANT_API_BASE and passes our Authorization header through.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = getApiKey();
  const headers = new Headers(init.headers);
  if (key) headers.set("Authorization", `Bearer ${key}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const r = await fetch(`/api${path}`, { ...init, headers });
  if (!r.ok) {
    let detail: string = r.statusText;
    try {
      const j = await r.json();
      const d = j.detail ?? j.message;
      // FastAPI validation errors arrive as an array of objects — flatten them
      // so the UI shows something readable instead of "[object Object]".
      if (Array.isArray(d)) {
        detail = d
          .map((e: { loc?: unknown[]; msg?: string }) =>
            `${(e.loc || []).join(".")}: ${e.msg || JSON.stringify(e)}`,
          )
          .join("; ");
      } else if (typeof d === "string") {
        detail = d;
      } else if (d != null) {
        detail = JSON.stringify(d);
      }
    } catch {
      // body wasn't json — keep statusText
    }
    throw new ApiError(r.status, detail);
  }
  return r.json() as Promise<T>;
}

// --- Response types we care about for Phase 1 ---------------------------------

export interface Entry {
  id: string;
  title: string;
  content_type: string;
  sensitivity: string;
  logical_path: string;
  summary?: string | null;
  content: string;
  tags?: string[];
  updated_at: string;
  created_at: string;
  version: number;
}

export interface EntryList {
  entries: Entry[];
  total: number;
  limit: number;
  offset: number;
}

export interface TagWithCount {
  tag: string;
  count: number;
}

export interface TagListResponse {
  tags: TagWithCount[];
  total: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  link_type: string;
  weight: number;
}

export interface GraphNode {
  id: string;
  title: string;
  content_type: string;
  logical_path: string;
  summary?: string | null;
  updated_at: string;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_nodes: number;
  total_edges: number;
  truncated: boolean;
  generated_at: string;
}

export interface IndexCategory {
  content_type: string;
  count: number;
}

export interface IndexResponse {
  depth: number;
  total_entries: number;
  categories: IndexCategory[];
}

export interface TopEntryRow {
  entry_id: string;
  title?: string;
  hits: number;
}

// --- Endpoints used by the dashboard -----------------------------------------

export interface ListEntriesParams {
  q?: string;
  content_type?: string;
  logical_path?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const listEntries = (params: ListEntriesParams = {}) =>
  request<EntryList>(
    `/entries${qs({ limit: 200, offset: 0, ...params })}`,
  );

export const getEntry = (id: string) => request<Entry>(`/entries/${id}`);

// Pull every entry by walking pages (API caps each page at 200). Capped at
// `max` to keep dashboard cost bounded; Phase 2 switches to a streaming view.
export async function listAllEntries(max = 2000): Promise<EntryList> {
  const pageSize = 200;
  const first = await listEntries({ limit: pageSize, offset: 0 });
  const all = [...first.entries];
  for (let offset = pageSize; offset < first.total && all.length < max; offset += pageSize) {
    const page = await listEntries({ limit: pageSize, offset });
    all.push(...page.entries);
    if (page.entries.length === 0) break;
  }
  return { entries: all, total: first.total, limit: pageSize, offset: 0 };
}

export const listTags = () => request<TagListResponse>(`/tags`);

export const getGraph = () => request<GraphResponse>(`/graph`);

export const getIndex = (depth = 1) =>
  request<IndexResponse>(`/index?depth=${depth}`);

export const topEntries = (since = "7d") =>
  request<{ rows: TopEntryRow[] } | TopEntryRow[]>(
    `/analytics/top-entries?since=${since}`,
  );

export const health = () => request<{ status: string }>(`/version`).catch(() =>
  ({ status: "unknown" }),
);
