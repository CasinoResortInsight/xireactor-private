// Slide-out chat panel. Talks to the shared ChatClient, renders the streamed
// conversation (assistant markdown, tool calls, inline approval prompts), and
// passes the current entry id as context so "summarize this entry" works.

import { useEffect, useRef, useState } from "react";
import { ChatClient, ConnState, ServerEvent } from "../chat";
import { buildHandleResolver, renderMarkdown } from "../markdown";
import { Route } from "../router";

// No cross-entry wikilink resolution inside chat; /kb/<id> links still work.
const mdResolver = buildHandleResolver([]);

interface ChatItem {
  id: number;
  kind: "user" | "assistant" | "tool" | "approval" | "error" | "status";
  text?: string;
  toolName?: string;
  toolInput?: unknown;
  reqId?: string; // for approval items
  resolved?: "allow" | "deny";
}

let nextId = 1;

export function ChatPanel({
  client,
  route,
  open,
  onClose,
}: {
  client: ChatClient;
  route: Route;
  open: boolean;
  onClose: () => void;
}) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<ConnState>(client.getState());
  const [thinking, setThinking] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const contextEntryId = route.name === "entry" ? route.id : undefined;

  // Lazily connect the first time the panel is opened (not before — we don't
  // want to spin up an agent the user never asked for). The component stays
  // mounted after that, so the transcript survives close/reopen.
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  // Subscribe once mounted; connect when first opened.
  useEffect(() => {
    if (!everOpened) return;
    client.connect();
    const offState = client.onState(setState);
    const offEvent = client.onEvent((ev: ServerEvent) => {
      switch (ev.type) {
        case "text":
          setItems((it) => append(it, { kind: "assistant", text: ev.text }));
          setThinking(false);
          break;
        case "tool_use":
          setItems((it) => [
            ...it,
            { id: nextId++, kind: "tool", toolName: ev.name, toolInput: ev.input },
          ]);
          break;
        case "approval_request":
          setItems((it) => [
            ...it,
            {
              id: nextId++,
              kind: "approval",
              toolName: ev.name,
              toolInput: ev.input,
              reqId: ev.req_id,
            },
          ]);
          break;
        case "error":
          setItems((it) => [...it, { id: nextId++, kind: "error", text: ev.message }]);
          setThinking(false);
          break;
        case "turn_done":
          setThinking(false);
          break;
      }
    });
    return () => {
      offState();
      offEvent();
    };
  }, [client, everOpened]);

  // Autoscroll to newest.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [items, thinking]);

  function send() {
    const text = input.trim();
    if (!text || state !== "ready" || thinking) return;
    setItems((it) => [...it, { id: nextId++, kind: "user", text }]);
    client.send(text, contextEntryId);
    setInput("");
    setThinking(true);
  }

  function respond(item: ChatItem, allow: boolean) {
    if (!item.reqId) return;
    client.respondApproval(item.reqId, allow);
    setItems((it) =>
      it.map((x) => (x.id === item.id ? { ...x, resolved: allow ? "allow" : "deny" } : x)),
    );
  }

  // Nothing rendered until the user first opens it.
  if (!everOpened) return null;

  return (
    <div className={open ? "" : "chat-hidden"}>
      {open && <div className="drawer-backdrop" onClick={onClose} />}
      <div className="chat-panel" role="dialog" aria-label="KB assistant">
        <div className="chat-head">
          <h2>KB Assistant</h2>
          <span className={`chat-conn ${state}`}>{state}</span>
          <button className="link-btn" onClick={onClose}>close</button>
        </div>

        {contextEntryId && (
          <div className="chat-context">Context: this entry is attached to your messages.</div>
        )}

        <div className="chat-log" ref={scrollRef}>
          {items.length === 0 && (
            <div className="chat-hint">
              Ask about the knowledge base — e.g. <i>“what did we decide about the
              snack bar refresh?”</i> or <i>“draft a daily note for today and file
              it under daily/2026/05”</i>. Writes pause for your approval.
            </div>
          )}
          {items.map((it) => (
            <ChatBubble key={it.id} item={it} onRespond={respond} />
          ))}
          {thinking && <div className="chat-thinking">thinking…</div>}
        </div>

        <div className="chat-input">
          <textarea
            rows={2}
            value={input}
            placeholder={state === "ready" ? "Message the assistant…" : "Connecting…"}
            disabled={state !== "ready"}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn primary" onClick={send} disabled={state !== "ready" || thinking}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// Append text to the trailing assistant bubble if the last item is one, else
// start a new assistant bubble — keeps streamed chunks in a single bubble.
function append(items: ChatItem[], add: { kind: "assistant"; text: string }): ChatItem[] {
  const last = items[items.length - 1];
  if (last && last.kind === "assistant") {
    return items.map((x, i) =>
      i === items.length - 1 ? { ...x, text: (x.text || "") + add.text } : x,
    );
  }
  return [...items, { id: nextId++, kind: "assistant", text: add.text }];
}

function ChatBubble({
  item,
  onRespond,
}: {
  item: ChatItem;
  onRespond: (item: ChatItem, allow: boolean) => void;
}) {
  if (item.kind === "user") {
    return <div className="bubble user">{item.text}</div>;
  }
  if (item.kind === "assistant") {
    return (
      <div
        className="bubble assistant entry-body"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(item.text || "", mdResolver) }}
      />
    );
  }
  if (item.kind === "error") {
    return <div className="bubble error">{item.text}</div>;
  }
  if (item.kind === "tool") {
    return (
      <details className="bubble tool">
        <summary>
          <code>{item.toolName}</code>
        </summary>
        <pre>{JSON.stringify(item.toolInput, null, 2)}</pre>
      </details>
    );
  }
  // approval
  return (
    <div className="bubble approval">
      <div className="approval-head">
        Approve <code>{item.toolName}</code>?
      </div>
      <pre>{JSON.stringify(item.toolInput, null, 2)}</pre>
      {item.resolved ? (
        <div className={`approval-done ${item.resolved}`}>
          {item.resolved === "allow" ? "Approved" : "Declined"}
        </div>
      ) : (
        <div className="approval-actions">
          <button className="btn primary" onClick={() => onRespond(item, true)}>Approve</button>
          <button className="btn danger" onClick={() => onRespond(item, false)}>Deny</button>
        </div>
      )}
    </div>
  );
}
