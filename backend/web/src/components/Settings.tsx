import { useState } from "react";
import { getApiKey, setApiKey } from "../auth";
import { ApiError, login } from "../api";

type Tab = "key" | "login";

export function Settings({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("key");
  const [value, setValue] = useState(getApiKey());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveKey() {
    setApiKey(value.trim());
    onClose();
    window.location.reload();
  }

  async function doLogin() {
    if (!email.trim() || !password) return setError("Email and password required.");
    setBusy(true);
    setError(null);
    try {
      const resp = await login(email.trim(), password);
      setApiKey(resp.api_key);
      onClose();
      window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? `Login failed (${e.status}): ${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={busy ? undefined : onClose} />
      <div className="drawer" role="dialog" aria-label="Settings">
        <h2>Settings</h2>

        <div className="tabs">
          <button className={`tab ${tab === "key" ? "active" : ""}`} onClick={() => setTab("key")}>
            API key
          </button>
          <button className={`tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>
            Email login
          </button>
        </div>

        {error && <div className="error">{error}</div>}

        {tab === "key" ? (
          <>
            <label htmlFor="api-key">Brilliant API key</label>
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              placeholder="bkai_…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <p className="hint">
              Stored in this browser's <code>localStorage</code> and attached as{" "}
              <code>Authorization: Bearer …</code> on every request. It's validated
              against <code>/session</code> on save — your identity shows in the top bar.
            </p>
            <div className="actions">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn primary" onClick={saveKey}>Save</button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="hint warn">
              ⚠ Logging in <b>rotates your API key</b> — the server revokes all
              existing keys and issues a fresh one. Any other tool using your old
              key (MCP client, scripts) will stop working until updated. If you
              just want to use this console, paste an existing key on the other tab
              instead.
            </p>
            <div className="actions">
              <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn primary" onClick={doLogin} disabled={busy}>
                {busy ? "Logging in…" : "Log in & rotate key"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
