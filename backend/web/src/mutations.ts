// Tiny pub/sub for "the KB just changed" so views that aren't currently
// mounted (and therefore can't be informed via React state) refresh on their
// next render. Anything that writes calls `notifyMutated()`; readers
// subscribe with `useMutationCounter()` and include the counter in their
// effect deps.

import { useEffect, useState } from "react";
import { listEntries } from "./api";
import { bustCache } from "./cache";

let counter = 0;
const listeners = new Set<() => void>();

export function notifyMutated(): void {
  counter++;
  bustCache();
  for (const l of listeners) l();
}

export function useMutationCounter(): number {
  const [, setN] = useState(counter);
  useEffect(() => {
    const fn = () => setN(counter);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return counter;
}

// --- Live polling -------------------------------------------------------------
// The main API has no SSE/WS today, so we poll `/entries?limit=1` (which is
// ordered by updated_at DESC) every 10s. When the newest timestamp advances
// past what we last saw, fire notifyMutated() so every subscribed view
// refetches. Cheap: one tiny request every 10s, ~150 bytes of JSON.

const POLL_INTERVAL_MS = 10_000;
let lastSeenUpdatedAt: string | null = null;
let pollTimer: number | null = null;
let pollInFlight = false;
let pollEnabled = false;

async function pollOnce(): Promise<void> {
  if (pollInFlight || !pollEnabled) return;
  pollInFlight = true;
  try {
    const r = await listEntries({ limit: 1, offset: 0 });
    if (r.entries.length === 0) return;
    const newest = r.entries[0].updated_at;
    if (lastSeenUpdatedAt && newest > lastSeenUpdatedAt) {
      notifyMutated();
    }
    lastSeenUpdatedAt = newest;
  } catch {
    // Transient (offline, auth blip) — swallow; we'll retry next tick.
  } finally {
    pollInFlight = false;
  }
}

export function startLivePolling(): void {
  if (pollTimer != null) return;
  pollEnabled = true;
  // Prime baseline without firing; first real notify only happens on a
  // *subsequent* observation that exceeds it.
  pollOnce();
  pollTimer = window.setInterval(pollOnce, POLL_INTERVAL_MS);
}

export function stopLivePolling(): void {
  pollEnabled = false;
  if (pollTimer != null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
