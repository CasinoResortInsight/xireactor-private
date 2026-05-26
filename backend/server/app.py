"""KB admin backend — Phase 1.

Thin FastAPI reverse proxy in front of the Brilliant API. The web SPA talks
to `/api/*` on this server; this server forwards to BRILLIANT_API_BASE,
passing the client's `Authorization` header through unchanged.

Run:
    BRILLIANT_API_BASE=http://localhost:8010 \\
    uvicorn server.app:app --reload --port 8012
"""

from __future__ import annotations

import os

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

API_BASE = os.environ.get("BRILLIANT_API_BASE", "http://localhost:8010").rstrip("/")

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
    return {"status": "ok", "upstream": API_BASE}


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
}


@app.api_route(
    "/api/{path:path}",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
)
async def proxy(path: str, request: Request) -> Response:
    url = f"{API_BASE}/{path}"
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
