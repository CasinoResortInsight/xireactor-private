// Identity layer: validates the stored API key against GET /session and
// exposes the caller's identity + role so the UI can (a) show who's logged in,
// (b) surface an invalid/expired key clearly, and (c) gate admin-only actions
// (staging approve/reject, tag admin) behind role === "admin".

import { useEffect, useState } from "react";
import { ApiError, SessionUser, getSession } from "./api";
import { getApiKey } from "./auth";

export type IdentityState =
  | { status: "loading" }
  | { status: "anon" } // no key set
  | { status: "ok"; user: SessionUser }
  | { status: "invalid"; error: string };

let cached: IdentityState = { status: "loading" };
const listeners = new Set<() => void>();
let loadStarted = false;

function emit() {
  for (const l of listeners) l();
}

export function refreshIdentity(): void {
  loadStarted = true;
  if (!getApiKey()) {
    cached = { status: "anon" };
    emit();
    return;
  }
  cached = { status: "loading" };
  emit();
  getSession()
    .then((user) => {
      cached = { status: "ok", user };
      emit();
    })
    .catch((e: unknown) => {
      const error =
        e instanceof ApiError
          ? e.status === 401
            ? "API key rejected (401)"
            : `API ${e.status}: ${e.message}`
          : String(e);
      cached = { status: "invalid", error };
      emit();
    });
}

export function useIdentity(): IdentityState {
  const [, setN] = useState(0);
  useEffect(() => {
    const fn = () => setN((n) => n + 1);
    listeners.add(fn);
    if (!loadStarted) refreshIdentity();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return cached;
}

export function isAdmin(s: IdentityState): boolean {
  return s.status === "ok" && s.user.role === "admin";
}
