// Chat WebSocket client. Owns one connection to the backend's
// /api/chat/ws endpoint for the lifetime of the app (kept alive even when the
// panel is closed, so reopening resumes the same conversation). Translates the
// JSON event protocol into typed callbacks the ChatPanel renders.

import { getApiKey } from "./auth";

export type ServerEvent =
  | { type: "ready" }
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "approval_request"; req_id: string; name: string; input: unknown }
  | { type: "result"; session_id: string | null; cost_usd: number; usage: unknown }
  | { type: "turn_done" }
  | { type: "error"; message: string };

type Listener = (ev: ServerEvent) => void;

export type ConnState = "connecting" | "ready" | "closed" | "error";

export class ChatClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<(s: ConnState) => void>();
  private state: ConnState = "closed";
  private initialized = false;

  onEvent(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onState(fn: (s: ConnState) => void): () => void {
    this.stateListeners.add(fn);
    fn(this.state);
    return () => this.stateListeners.delete(fn);
  }
  getState(): ConnState {
    return this.state;
  }

  private setState(s: ConnState) {
    this.state = s;
    for (const fn of this.stateListeners) fn(s);
  }
  private emit(ev: ServerEvent) {
    for (const fn of this.listeners) fn(ev);
  }

  connect(): void {
    if (this.ws && (this.state === "ready" || this.state === "connecting")) return;
    const key = getApiKey();
    if (!key) {
      this.setState("error");
      this.emit({ type: "error", message: "No API key set — open Settings first." });
      return;
    }
    this.initialized = false;
    this.setState("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/chat/ws`);
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "init", key }));
    ws.onmessage = (e) => {
      let ev: ServerEvent;
      try {
        ev = JSON.parse(e.data);
      } catch {
        return;
      }
      if (ev.type === "ready") {
        this.initialized = true;
        this.setState("ready");
      }
      this.emit(ev);
    };
    ws.onerror = () => {
      this.setState("error");
      this.emit({ type: "error", message: "WebSocket error — is the proxy running?" });
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.state !== "error") this.setState("closed");
    };
  }

  send(text: string, contextEntryId?: string): boolean {
    if (!this.ws || !this.initialized) return false;
    this.ws.send(
      JSON.stringify({ type: "user", text, context_entry_id: contextEntryId || undefined }),
    );
    return true;
  }

  respondApproval(reqId: string, allow: boolean): void {
    this.ws?.send(
      JSON.stringify({ type: "approval", req_id: reqId, decision: allow ? "allow" : "deny" }),
    );
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.setState("closed");
  }
}

// One shared instance for the whole app.
export const chatClient = new ChatClient();
