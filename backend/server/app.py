"""KB admin backend — Phase 1.

Thin FastAPI reverse proxy in front of the Brilliant API. The web SPA talks
to `/api/*` on this server; this server forwards to BRILLIANT_API_BASE,
passing the client's `Authorization` header through unchanged.

Run:
    BRILLIANT_API_BASE=http://localhost:8010 \\
    uvicorn server.app:app --reload --port 8012
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

API_BASE = os.environ.get("BRILLIANT_API_BASE", "http://localhost:8010").rstrip("/")

# Multi-KB support: the SPA can target different Brilliant instances by sending
# an `X-KB-Base` header per request. When absent, the env default is used.
# Optional allow-list (comma-separated bases) constrains where the proxy will
# forward — leave unset on a trusted single-operator machine.
_ALLOWED_BASES = {
    b.strip().rstrip("/")
    for b in os.environ.get("BRILLIANT_ALLOWED_BASES", "").split(",")
    if b.strip()
}


def _resolve_upstream(request: Request) -> str:
    """Pick the upstream Brilliant API base for this request.

    Honors the `X-KB-Base` header (multi-KB switching). Validates the scheme
    and, if `BRILLIANT_ALLOWED_BASES` is set, that the base is allow-listed.
    Falls back to the env default when the header is absent.
    """
    raw = (request.headers.get("x-kb-base") or "").strip().rstrip("/")
    if not raw:
        return API_BASE
    if not raw.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="X-KB-Base must be http(s)")
    if _ALLOWED_BASES and raw not in _ALLOWED_BASES:
        raise HTTPException(status_code=403, detail="X-KB-Base not allow-listed")
    return raw

# Reuse the standalone demo builder (tools/build_kb_demo.py) for the "Export
# snapshot" feature — same self-contained HTML artifact the share-out workflow
# already relies on. We only borrow its pure helpers (derive_links,
# HTML_TEMPLATE); the network fetch is done here with the caller's key.
_TOOLS_DIR = Path(__file__).resolve().parents[2] / "tools"
sys.path.insert(0, str(_TOOLS_DIR))
try:
    from build_kb_demo import HTML_TEMPLATE, derive_links  # type: ignore
except Exception:  # pragma: no cover - export just degrades to 503
    HTML_TEMPLATE = None  # type: ignore
    derive_links = None  # type: ignore

app = FastAPI(title="KB Admin Backend", version="0.1.0")

# Vite dev server runs on a different port; allow it through during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# One shared client for connection pooling.
_client = httpx.AsyncClient(timeout=30.0)


@app.on_event("shutdown")
async def _close_client() -> None:
    await _client.aclose()


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "upstream": API_BASE,
        "chat": "on" if os.environ.get("ANTHROPIC_API_KEY") else "off",
    }


# Claude chat WebSocket (Phase 6). Imported lazily-ish at module load; the
# handler itself defers the SDK import so the proxy boots even without it.
from chat import chat_websocket  # noqa: E402

app.websocket("/api/chat/ws")(chat_websocket)


@app.get("/export")
async def export_snapshot(request: Request) -> Response:
    """Build a self-contained HTML snapshot of the KB and return it as a
    download. Reuses tools/build_kb_demo.py so the artifact matches the
    existing share-out workflow. Requires the caller's Authorization header.
    """
    if HTML_TEMPLATE is None or derive_links is None:
        raise HTTPException(status_code=503, detail="Export builder unavailable")

    auth = request.headers.get("authorization")
    if not auth:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    upstream = await _client.get(
        f"{_resolve_upstream(request)}/entries",
        params={"limit": 200},
        headers={"Authorization": auth},
    )
    if upstream.status_code != 200:
        raise HTTPException(status_code=upstream.status_code, detail="Upstream /entries failed")
    entries = upstream.json()["entries"]

    edges = derive_links(entries)
    blob = json.dumps({"entries": entries, "edges": edges}, ensure_ascii=False)
    if "</script" in blob:
        blob = blob.replace("</script", "<\\/script")
    html = HTML_TEMPLATE.replace("__KB_DATA__", blob)

    return Response(
        content=html,
        media_type="text/html",
        headers={"Content-Disposition": 'attachment; filename="kb-snapshot.html"'},
    )


# Headers we never forward upstream (hop-by-hop or set automatically by httpx).
_HOP_BY_HOP = {
    "host",
    "content-length",
    "connection",
    "keep-alive",
    "transfer-encoding",
    "upgrade",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "x-kb-base",  # consumed here; never forwarded upstream
}


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request) -> Response:
    url = f"{_resolve_upstream(request)}/{path}"
    forward_headers = {
        k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    body = await request.body()
    upstream = await _client.request(
        request.method,
        url,
        params=request.query_params,
        content=body,
        headers=forward_headers,
    )
    # Strip hop-by-hop on the way back too.
    out_headers = {
        k: v for k, v in upstream.headers.items() if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=out_headers,
        media_type=upstream.headers.get("content-type"),
    )
