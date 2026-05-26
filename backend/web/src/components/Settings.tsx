// Settings = connection manager. The operator maintains several knowledge
// bases in different locations; each connection is {name, baseUrl, apiKey,
// mcpUrl?}. Switching the active connection reloads the app so every view,
// identity, and the chat reconnect against the chosen KB.

import { useState } from "react";
import {
  Connection,
  getActiveConnectionId,
  listConnections,
  removeConnection,
  setActiveConnectionId,
  upsertConnection,
} from "../auth";
import { ApiError, loginAt } from "../api";

type Editing = (Partial<Connection> & { _new?: boolean }) | null;

export function Settings({ onClose }: { onClose: () => void }) {
  const [conns, setConns] = useState<Connection[]>(listConnections());
  const activeId = getActiveConnectionId();
  const [editing, setEditing] = useState<Editing>(
    conns.length === 0 ? { _new: true, name: "", baseUrl: "", apiKey: "" } : null,
  );

  function switchTo(id: string) {
    setActiveConnectionId(id);
    window.location.reload();
  }

  function del(id: string) {
    if (!window.confirm("Remove this connection?")) return;
    removeConnection(id);
    if (id === activeId) {
      window.location.reload();
    } else {
      setConns(listConnections());
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer drawer-wide" role="dialog" aria-label="Connections">
        <h2>Knowledge bases</h2>

        {editing ? (
          <ConnectionForm
            initial={editing}
            onCancel={() => (conns.length ? setEditing(null) : onClose())}
            onSaved={(saved, makeActive) => {
              if (makeActive) {
                setActiveConnectionId(saved.id);
                window.location.reload();
                return;
              }
              setConns(listConnections());
              setEditing(null);
            }}
          />
        ) : (
          <>
            <p className="hint">
              Each connection is a Brilliant API location + key. The active one
              drives every request (sent to the proxy as <code>X-KB-Base</code>)
              and the AI chat. Switching reloads the console.
            </p>

            <ul className="conn-list">
              {conns.map((c) => (
                <li key={c.id} className={c.id === activeId ? "active" : ""}>
                  <div className="conn-main">
                    <div className="conn-name">
                      {c.name || "(unnamed)"}
                      {c.id === activeId && <span className="conn-badge">active</span>}
                    </div>
                    <div className="conn-url">{c.baseUrl || "proxy default upstream"}</div>
                  </div>
                  <div className="conn-actions">
                    {c.id !== activeId && (
                      <button className="link-btn" onClick={() => switchTo(c.id)}>use</button>
                    )}
                    <button className="link-btn" onClick={() => setEditing(c)}>edit</button>
                    <button className="link-btn danger" onClick={() => del(c.id)}>delete</button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="actions" style={{ justifyContent: "space-between" }}>
              <button
                className="btn"
                onClick={() => setEditing({ _new: true, name: "", baseUrl: "", apiKey: "" })}
              >
                + Add connection
              </button>
              <button className="btn primary" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ConnectionForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Partial<Connection> & { _new?: boolean };
  onCancel: () => void;
  onSaved: (saved: Connection, makeActive: boolean) => void;
}) {
  const isNew = !!initial._new;
  const [name, setName] = useState(initial.name || "");
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl || "");
  const [apiKey, setApiKey] = useState(initial.apiKey || "");
  const [mcpUrl, setMcpUrl] = useState(initial.mcpUrl || "");
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchKey() {
    if (!email.trim() || !password) return setError("Email and password required.");
    setBusy(true);
    setError(null);
    try {
      const resp = await loginAt(baseUrl.trim(), email.trim(), password);
      setApiKey(resp.api_key);
      setShowLogin(false);
      setPassword("");
    } catch (e) {
      setError(e instanceof ApiError ? `Login failed (${e.status}): ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  function save(makeActive: boolean) {
    if (!name.trim()) return setError("Give this connection a name.");
    if (!apiKey.trim()) return setError("An API key is required (paste one or log in).");
    const saved = upsertConnection({
      id: initial.id,
      name: name.trim(),
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      apiKey: apiKey.trim(),
      mcpUrl: mcpUrl.trim() || undefined,
    });
    onSaved(saved, makeActive);
  }

  return (
    <>
      <h3 style={{ marginTop: 0 }}>{isNew ? "New connection" : "Edit connection"}</h3>
      {error && <div className="error">{error}</div>}

      <label>Name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Production KB" autoFocus />

      <label>API base URL</label>
      <input
        className="mono"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="https://kb.example.com  (blank = proxy default)"
      />

      <label>API key</label>
      <input
        className="mono"
        type="password"
        autoComplete="off"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="bkai_…"
      />
      <button className="link-btn" onClick={() => setShowLogin((s) => !s)}>
        {showLogin ? "hide email login" : "…or fetch a key via email login"}
      </button>

      {showLogin && (
        <div className="login-box">
          <p className="hint warn">
            ⚠ Logging in <b>rotates the key</b> for this account on that server
            (revokes existing keys). Use only if you don't already have a key.
          </p>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <button className="btn" onClick={fetchKey} disabled={busy}>
            {busy ? "Logging in…" : "Log in & rotate key"}
          </button>
        </div>
      )}

      <label>Remote MCP URL (optional, for chat)</label>
      <input
        className="mono"
        value={mcpUrl}
        onChange={(e) => setMcpUrl(e.target.value)}
        placeholder="https://mcp.example.com/mcp  (blank = local stdio MCP)"
      />
      <p className="hint">
        Leave blank to use the local stdio MCP server pointed at this base. Set
        it to talk to a remote MCP for this KB.
      </p>

      <div className="actions">
        <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className="btn" onClick={() => save(false)} disabled={busy}>Save</button>
        <button className="btn primary" onClick={() => save(true)} disabled={busy}>
          Save &amp; use
        </button>
      </div>
    </>
  );
}
