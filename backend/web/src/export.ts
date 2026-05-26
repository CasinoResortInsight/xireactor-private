// "Export HTML" — asks the backend's /export endpoint (which reuses
// tools/build_kb_demo.py) to build a self-contained snapshot, then triggers a
// browser download. We fetch with the Authorization header rather than a plain
// link because the endpoint requires the bearer key.

import { getApiKey } from "./auth";
import { ApiError } from "./api";

export async function exportSnapshot(): Promise<void> {
  const key = getApiKey();
  const r = await fetch("/export", {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  if (!r.ok) {
    let detail = r.statusText;
    try {
      detail = (await r.json()).detail || detail;
    } catch {
      /* keep statusText */
    }
    throw new ApiError(r.status, detail);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `kb-snapshot-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
