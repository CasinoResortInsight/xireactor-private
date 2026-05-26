// Connection store. The operator maintains several knowledge bases hosted in
// different locations; each is a "connection": a Brilliant API base URL + key
// (+ optional remote MCP URL for chat). One connection is active at a time.
//
// The active connection drives every request: its key goes out as
// `Authorization: Bearer …` and its base as the `X-KB-Base` header, which the
// proxy uses to choose the upstream. An empty baseUrl means "use the proxy's
// own default upstream" (handy for local dev).
//
// Back-compat: getApiKey()/hasApiKey() still work — they read the active
// connection. A pre-existing single key under the old `kb-admin.apiKey` key is
// migrated into a "Default" connection on first load.

export interface Connection {
  id: string;
  name: string;
  baseUrl: string; // "" → proxy default upstream
  apiKey: string;
  mcpUrl?: string; // optional remote MCP endpoint for chat
}

const CONNS_KEY = "kb-admin.connections";
const ACTIVE_KEY = "kb-admin.activeConnectionId";
const LEGACY_KEY = "kb-admin.apiKey";

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function load(): Connection[] {
  try {
    const raw = localStorage.getItem(CONNS_KEY);
    if (raw) return JSON.parse(raw) as Connection[];
  } catch {
    /* fall through to migration / empty */
  }
  // Migrate a legacy single key, if present.
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    const conn: Connection = { id: uid(), name: "Default", baseUrl: "", apiKey: legacy };
    save([conn]);
    setActiveConnectionId(conn.id);
    localStorage.removeItem(LEGACY_KEY);
    return [conn];
  }
  return [];
}

function save(conns: Connection[]): void {
  localStorage.setItem(CONNS_KEY, JSON.stringify(conns));
}

export function listConnections(): Connection[] {
  return load();
}

export function getActiveConnectionId(): string {
  return localStorage.getItem(ACTIVE_KEY) || "";
}

export function setActiveConnectionId(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getActiveConnection(): Connection | null {
  const conns = load();
  if (conns.length === 0) return null;
  const id = getActiveConnectionId();
  return conns.find((c) => c.id === id) || conns[0];
}

export function upsertConnection(input: Omit<Connection, "id"> & { id?: string }): Connection {
  const conns = load();
  if (input.id) {
    const idx = conns.findIndex((c) => c.id === input.id);
    if (idx >= 0) {
      conns[idx] = { ...conns[idx], ...input, id: input.id };
      save(conns);
      return conns[idx];
    }
  }
  const created: Connection = { ...input, id: uid() };
  conns.push(created);
  save(conns);
  // First connection becomes active automatically.
  if (conns.length === 1) setActiveConnectionId(created.id);
  return created;
}

export function removeConnection(id: string): void {
  const conns = load().filter((c) => c.id !== id);
  save(conns);
  if (getActiveConnectionId() === id) {
    setActiveConnectionId(conns[0]?.id || "");
  }
}

// --- Back-compat accessors used across the app -------------------------------

export function getApiKey(): string {
  return getActiveConnection()?.apiKey || "";
}

export function getActiveBaseUrl(): string {
  return getActiveConnection()?.baseUrl || "";
}

export function getActiveMcpUrl(): string {
  return getActiveConnection()?.mcpUrl || "";
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}

// Update just the active connection's key (used by email/password login).
export function setApiKey(value: string): void {
  const active = getActiveConnection();
  if (active) {
    upsertConnection({ ...active, apiKey: value });
  } else {
    upsertConnection({ name: "Default", baseUrl: "", apiKey: value });
  }
}
