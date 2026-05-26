#!/usr/bin/env bash
#
# One-command dev launcher for the KB admin console.
#
#   ./dev.sh
#
# Idempotently bootstraps the Python venv + npm deps, loads server/.env if
# present, then runs the FastAPI proxy (:8012) and the Vite dev server (:5173)
# together. Ctrl-C stops both.
#
# Env you may want (export, or put in backend/server/.env):
#   BRILLIANT_API_BASE   default upstream KB        (default http://localhost:8010)
#   ANTHROPIC_API_KEY    enables the Ask-AI chat    (optional)
#   PROXY_PORT           proxy port                 (default 8012)
#
set -euo pipefail
cd "$(dirname "$0")" # backend/

PROXY_PORT="${PROXY_PORT:-8012}"

# --- prereqs ---------------------------------------------------------------
command -v python3 >/dev/null || { echo "✗ python3 not found" >&2; exit 1; }
command -v node    >/dev/null || { echo "✗ node not found" >&2; exit 1; }

# --- python venv + deps (only install when requirements change) -----------
if [ ! -d server/.venv ]; then
  echo "→ creating Python venv (server/.venv)"
  python3 -m venv server/.venv
fi
# shellcheck disable=SC1091
source server/.venv/bin/activate
if [ ! -f server/.venv/.deps-stamp ] || [ server/requirements.txt -nt server/.venv/.deps-stamp ]; then
  echo "→ installing Python deps"
  pip install -q -r server/requirements.txt
  touch server/.venv/.deps-stamp
fi

# --- node deps (only when package.json changes) ---------------------------
if [ ! -d web/node_modules ] || [ ! -f web/node_modules/.deps-stamp ] || [ web/package.json -nt web/node_modules/.deps-stamp ]; then
  echo "→ installing npm deps"
  (cd web && npm install)
  touch web/node_modules/.deps-stamp
fi

# --- env -------------------------------------------------------------------
if [ -f server/.env ]; then
  echo "→ loading server/.env"
  set -a; # shellcheck disable=SC1091
  source server/.env; set +a
fi
export BRILLIANT_API_BASE="${BRILLIANT_API_BASE:-http://localhost:8010}"

# --- friendly status -------------------------------------------------------
echo
echo "  proxy        → http://localhost:${PROXY_PORT}"
echo "  app          → http://localhost:5173"
echo "  upstream KB  → ${BRILLIANT_API_BASE}"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "  Ask-AI chat  → enabled"
else
  echo "  Ask-AI chat  → disabled (set ANTHROPIC_API_KEY to enable)"
fi
# Soft reachability hint for the upstream KB.
if ! curl -fsS -m 2 "${BRILLIANT_API_BASE}/health" >/dev/null 2>&1; then
  echo "  ⚠ upstream KB at ${BRILLIANT_API_BASE} didn't answer /health — start it, or set a connection in Settings."
fi
echo
echo "  Ctrl-C to stop both."
echo

# --- run both, clean up on exit -------------------------------------------
pids=()
cleanup() { trap - INT TERM EXIT; kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup INT TERM EXIT

( cd server && exec uvicorn app:app --reload --port "${PROXY_PORT}" ) &
pids+=($!)
( cd web && exec npm run dev ) &
pids+=($!)

# Wait for both; Ctrl-C triggers the trap, which stops them. (Plain `wait`
# for portability — `wait -n` needs bash 4+, and macOS ships 3.2.)
wait
