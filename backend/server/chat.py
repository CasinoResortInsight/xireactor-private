"""Claude chat for the KB admin — Phase 6.

Embeds the Claude Agent SDK (`claude-agent-sdk`) behind a WebSocket so the
admin can talk to the KB in English. The agent is wired to the existing
Brilliant MCP server, so it searches / reads / writes through the same code
paths the rest of the console uses.

Transport-agnostic MCP wiring (per design): the agent connects to the
Brilliant MCP server either as a local stdio subprocess (default, dev) or to a
remote HTTPS endpoint (streamable-http) when `BRILLIANT_MCP_URL` is set. Tool
names are namespaced `mcp__brilliant__*` identically in both modes, so the
allow-list and approval logic don't change between them.

Human-in-the-loop: read-only tools auto-approve; writes round-trip to the
browser for an explicit Approve/Deny before the tool runs.

Runtime requirements (documented in README):
  - `ANTHROPIC_API_KEY` in the server environment.
  - `pip install claude-agent-sdk` (Python 3.10+).
  - For stdio MCP (default): the `mcp/` server's own deps importable by the
    interpreter that launches it.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

# Repo layout: this file is backend/server/chat.py → repo root is parents[2].
_REPO_ROOT = Path(__file__).resolve().parents[2]
_MCP_DIR = _REPO_ROOT / "mcp"

API_BASE = os.environ.get("BRILLIANT_API_BASE", "http://localhost:8010").rstrip("/")
# When set, the agent talks to a remote MCP server over HTTPS instead of
# launching the local stdio subprocess.
MCP_URL = os.environ.get("BRILLIANT_MCP_URL", "").strip()

MAX_TURNS = int(os.environ.get("KB_CHAT_MAX_TURNS", "30"))
# Coarse cost guardrail: stop accepting new turns once cumulative spend for the
# process crosses this. Resets on restart. 0 disables the cap.
DAILY_USD_BUDGET = float(os.environ.get("KB_CHAT_DAILY_USD_BUDGET", "5"))
_spent_usd = 0.0

APPROVAL_TIMEOUT_S = 300

# Read-only tools the agent may call without asking. Everything else from the
# Brilliant server (creates, updates, deletes, promotion, imports, links,
# uploads, staging mutations) requires explicit user approval.
AUTO_APPROVE_TOOLS = {
    "WebSearch",
    "mcp__brilliant__search_entries",
    "mcp__brilliant__get_entry",
    "mcp__brilliant__get_index",
    "mcp__brilliant__get_lod",
    "mcp__brilliant__get_neighbors",
    "mcp__brilliant__get_tag_neighbors",
    "mcp__brilliant__get_types",
    "mcp__brilliant__get_usage_stats",
    "mcp__brilliant__get_version",
    "mcp__brilliant__list_tags",
    "mcp__brilliant__list_zone",
    "mcp__brilliant__list_staging",
    "mcp__brilliant__suggest_tags",
    "mcp__brilliant__session_init",
}

ALLOWED_TOOLS = ["mcp__brilliant__*", "WebSearch"]

SYSTEM_PROMPT = (
    "You are the knowledge-base admin assistant for Arguss Labs. You are "
    "talking to an authenticated admin operator inside an internal console. "
    "The Brilliant MCP server is available — use it to search, read, and "
    "(only with the operator's confirmation) write entries. Always read/search "
    "before writing. Prefer concise answers. When you reference an entry, cite "
    "it as a /kb/<id> link so the UI can make it clickable. This is a "
    "production knowledge base: never destroy or overwrite content without "
    "explaining what you're about to do. You have no shell or filesystem "
    "access — only the KB tools and web search."
)


def _mcp_servers(user_key: str) -> dict[str, Any]:
    """Build the mcp_servers config for the user's key, picking transport from
    env. Both shapes namespace tools as mcp__brilliant__*."""
    if MCP_URL:
        # Remote HTTPS (streamable-http). The user's key rides as a bearer; the
        # remote MCP enforces auth/identity itself.
        return {
            "brilliant": {
                "type": "http",
                "url": MCP_URL,
                "headers": {"Authorization": f"Bearer {user_key}"},
            }
        }
    # Local stdio subprocess. server.py uses cwd-relative imports, so put the
    # mcp dir on PYTHONPATH. The MCP presents this key upstream as its service
    # key, so the agent effectively acts as the key's owner.
    child_env = {
        **os.environ,
        "PYTHONPATH": f"{_MCP_DIR}{os.pathsep}{os.environ.get('PYTHONPATH', '')}",
        "BRILLIANT_BASE_URL": API_BASE,
        "BRILLIANT_SERVICE_API_KEY": user_key,
    }
    return {
        "brilliant": {
            "command": os.environ.get("KB_CHAT_PYTHON", "python"),
            "args": [str(_MCP_DIR / "server.py")],
            "env": child_env,
        }
    }


class ChatSession:
    """Owns one ClaudeSDKClient for the lifetime of a WebSocket and bridges the
    agent's approval callback to the browser."""

    def __init__(self, websocket: WebSocket, user_key: str):
        self.ws = websocket
        self.user_key = user_key
        self.client: Any = None
        self.session_id: str | None = None
        # req_id -> Future[bool] for pending approval prompts.
        self.pending: dict[str, asyncio.Future[bool]] = {}

    async def _send(self, payload: dict[str, Any]) -> None:
        await self.ws.send_json(payload)

    async def _can_use_tool(self, tool_name: str, input_data: dict, context: Any):
        # Lazy import so the proxy still boots without the SDK installed.
        # Result types moved between top-level and .types across versions —
        # accept either location.
        try:
            from claude_agent_sdk import PermissionResultAllow, PermissionResultDeny
        except ImportError:
            from claude_agent_sdk.types import (  # type: ignore
                PermissionResultAllow,
                PermissionResultDeny,
            )

        if tool_name in AUTO_APPROVE_TOOLS:
            return PermissionResultAllow(updated_input=input_data)

        # Write / unknown tool — ask the operator.
        req_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[bool] = loop.create_future()
        self.pending[req_id] = fut
        await self._send(
            {
                "type": "approval_request",
                "req_id": req_id,
                "name": tool_name,
                "input": input_data,
            }
        )
        try:
            approved = await asyncio.wait_for(fut, timeout=APPROVAL_TIMEOUT_S)
        except asyncio.TimeoutError:
            return PermissionResultDeny(message="Approval timed out.")
        finally:
            self.pending.pop(req_id, None)

        if approved:
            return PermissionResultAllow(updated_input=input_data)
        return PermissionResultDeny(message="The operator declined this action.")

    def resolve_approval(self, req_id: str, approved: bool) -> None:
        fut = self.pending.get(req_id)
        if fut and not fut.done():
            fut.set_result(approved)

    async def open(self) -> None:
        from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

        opts: dict[str, Any] = dict(
            system_prompt=SYSTEM_PROMPT,
            max_turns=MAX_TURNS,
            allowed_tools=ALLOWED_TOOLS,
            mcp_servers=_mcp_servers(self.user_key),
            permission_mode="default",
            can_use_tool=self._can_use_tool,
        )

        # The Python SDK's can_use_tool callback wants a PreToolUse hook present
        # to keep the permission stream open. HookMatcher's import location has
        # varied across versions, and the hook is a belt-and-suspenders helper,
        # so attach it best-effort and continue without it if unavailable.
        try:
            try:
                from claude_agent_sdk import HookMatcher  # type: ignore
            except ImportError:
                from claude_agent_sdk.types import HookMatcher  # type: ignore

            async def _keepalive_hook(input_data, tool_use_id, context):
                return {}

            opts["hooks"] = {"PreToolUse": [HookMatcher(matcher=None, hooks=[_keepalive_hook])]}
        except Exception:
            pass

        self.client = ClaudeSDKClient(options=ClaudeAgentOptions(**opts))
        await self.client.__aenter__()

    async def close(self) -> None:
        if self.client is not None:
            try:
                await self.client.__aexit__(None, None, None)
            except Exception:
                pass

    async def run_turn(self, text: str) -> None:
        """Drive one user turn, streaming events to the browser."""
        global _spent_usd
        if DAILY_USD_BUDGET and _spent_usd >= DAILY_USD_BUDGET:
            await self._send(
                {
                    "type": "error",
                    "message": (
                        f"Daily chat budget (${DAILY_USD_BUDGET:.2f}) reached. "
                        "Restart the proxy or raise KB_CHAT_DAILY_USD_BUDGET."
                    ),
                }
            )
            return

        from claude_agent_sdk import (
            AssistantMessage,
            ResultMessage,
            SystemMessage,
            TextBlock,
            ToolUseBlock,
        )

        await self.client.query(text)
        async for message in self.client.receive_response():
            if isinstance(message, SystemMessage):
                sid = getattr(message, "data", {}).get("session_id")
                if sid:
                    self.session_id = sid
            elif isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        await self._send({"type": "text", "text": block.text})
                    elif isinstance(block, ToolUseBlock):
                        await self._send(
                            {
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            }
                        )
            elif isinstance(message, ResultMessage):
                if message.session_id:
                    self.session_id = message.session_id
                cost = float(getattr(message, "total_cost_usd", 0.0) or 0.0)
                _spent_usd += cost
                await self._send(
                    {
                        "type": "result",
                        "session_id": self.session_id,
                        "cost_usd": cost,
                        "usage": getattr(message, "usage", None),
                    }
                )


async def chat_websocket(websocket: WebSocket) -> None:
    """WebSocket endpoint for the chat panel.

    Protocol (JSON):
      client → {type:"init", key}             first message, sets the API key
              → {type:"user", text}           a user turn
              → {type:"approval", req_id, decision:"allow"|"deny"}
      server → {type:"ready"|"text"|"tool_use"|"approval_request"|"result"|"error", ...}

    A single reader loop owns ws.receive; turns run sequentially from a queue so
    the approval callback (which sends on the socket) never races the reader.
    """
    await websocket.accept()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        await websocket.send_json(
            {
                "type": "error",
                "message": "Chat is unavailable: ANTHROPIC_API_KEY is not set on the server.",
            }
        )
        await websocket.close()
        return

    session: ChatSession | None = None
    user_queue: asyncio.Queue[str] = asyncio.Queue()
    worker: asyncio.Task | None = None

    async def turn_worker() -> None:
        while True:
            text = await user_queue.get()
            try:
                await session.run_turn(text)  # type: ignore[union-attr]
            except Exception as e:  # surface, keep the socket alive
                await websocket.send_json({"type": "error", "message": str(e)})
            finally:
                await websocket.send_json({"type": "turn_done"})

    try:
        while True:
            msg = await websocket.receive_json()
            kind = msg.get("type")

            if kind == "init":
                if session is not None:
                    continue
                key = (msg.get("key") or "").strip()
                if not key:
                    await websocket.send_json({"type": "error", "message": "Missing API key."})
                    continue
                session = ChatSession(websocket, key)
                try:
                    await session.open()
                except Exception as e:
                    await websocket.send_json(
                        {"type": "error", "message": f"Failed to start agent: {e}"}
                    )
                    await websocket.close()
                    return
                worker = asyncio.create_task(turn_worker())
                await websocket.send_json({"type": "ready"})

            elif kind == "user":
                if session is None:
                    await websocket.send_json({"type": "error", "message": "Not initialized."})
                    continue
                text = (msg.get("text") or "").strip()
                ctx_id = msg.get("context_entry_id")
                if ctx_id:
                    text = f"{text}\n\n(Context: the operator is currently viewing entry /kb/{ctx_id}.)"
                if text:
                    await user_queue.put(text)

            elif kind == "approval":
                if session is not None:
                    session.resolve_approval(
                        msg.get("req_id", ""), msg.get("decision") == "allow"
                    )

    except WebSocketDisconnect:
        pass
    finally:
        if worker is not None:
            worker.cancel()
        if session is not None:
            await session.close()
