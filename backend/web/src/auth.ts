// Phase-1 auth: the admin pastes their Brilliant API key into the Settings
// drawer; we keep it in localStorage and attach it as Bearer on every request.
// Phase 5 replaces this with a real session login through the main API.

const KEY = "kb-admin.apiKey";

export function getApiKey(): string {
  return localStorage.getItem(KEY) || "";
}

export function setApiKey(value: string): void {
  if (value) localStorage.setItem(KEY, value);
  else localStorage.removeItem(KEY);
}

export function hasApiKey(): boolean {
  return !!getApiKey();
}
