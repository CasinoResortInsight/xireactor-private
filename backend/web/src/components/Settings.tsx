import { useState } from "react";
import { getApiKey, setApiKey } from "../auth";

export function Settings({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState(getApiKey());

  function save() {
    setApiKey(value.trim());
    onClose();
    // Reload so every component re-fetches with the new key.
    window.location.reload();
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
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
          <code>Authorization: Bearer …</code> on every request to the proxy.
          Phase-1 only — real session login lands later.
        </p>
        <div className="actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save}>Save</button>
        </div>
      </div>
    </>
  );
}
