#!/usr/bin/env bash
# Container entrypoint: the target app under Vite, plus the orchestrator serving
# the built UI and proxying the app. Two processes, one port.
#
# `./scripts/dev.sh` is the local equivalent and stays the documented way to run
# this. The difference here is that the host gives us one port and expects one
# foreground process, so the orchestrator is it and Vite runs behind it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
APP_PORT="${APP_PORT:-5173}"

log() { printf '\033[1;36m▸\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
command -v kane-cli >/dev/null 2>&1 || die "kane-cli missing from the image"
command -v claude   >/dev/null 2>&1 || die "claude missing from the image"
command -v jq       >/dev/null 2>&1 || die "jq missing from the image"

# Kane's OAuth flow needs a browser, so a container authenticates with a
# username/access-key pair instead. Without it every run fails as an auth error —
# which the hooks now report as "not an app bug", but it is still a dead demo.
if [ -n "${KANE_USERNAME:-}" ] && [ -n "${KANE_ACCESS_KEY:-}" ]; then
  log "authenticating kane-cli as ${KANE_USERNAME}"
  kane-cli login --username "$KANE_USERNAME" --access-key "$KANE_ACCESS_KEY" >/dev/null 2>&1 \
    || log "WARNING: kane-cli login failed — runs will report an auth error, not an app bug"
else
  log "WARNING: KANE_USERNAME/KANE_ACCESS_KEY not set — Kane cannot verify anything"
fi

# --- model endpoint ----------------------------------------------------------
# Claude Code can be pointed at any Anthropic-compatible endpoint, with two
# catches this deployment hit:
#   1. it validates the model name locally and refuses anything outside its own
#      list, while the provider here accepts only its own name — so a tiny shim
#      rewrites `model` in flight (scripts/model-proxy.mjs).
#   2. ANTHROPIC_API_KEY sends x-api-key and makes Claude Code authenticate
#      against Anthropic itself (401 before any request leaves). Third-party
#      endpoints need ANTHROPIC_AUTH_TOKEN, which sends Authorization: Bearer.
if [ -n "${UPSTREAM_BASE_URL:-}" ] && [ -n "${UPSTREAM_MODEL:-}" ]; then
  PROXY_PORT="${PROXY_PORT:-4010}"
  log "starting model shim on :${PROXY_PORT} (${UPSTREAM_MODEL})"
  PROXY_PORT="$PROXY_PORT" node scripts/model-proxy.mjs &
  PROXY_PID=$!
  export ANTHROPIC_BASE_URL="http://127.0.0.1:${PROXY_PORT}"
  for _ in $(seq 1 20); do
    curl -sf -o /dev/null "http://127.0.0.1:${PROXY_PORT}/" 2>/dev/null && break
    sleep 0.25
  done
fi

if [ -z "${ANTHROPIC_AUTH_TOKEN:-}" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  log "WARNING: no ANTHROPIC_AUTH_TOKEN/ANTHROPIC_API_KEY — POST /run cannot start the agent"
fi

if [ -z "${KANE_RUN_SECRET:-}" ]; then
  log "WARNING: KANE_RUN_SECRET is empty — /run is UNGATED and anyone can spend your credits"
fi

# --- target app --------------------------------------------------------------
# Vite dev, not a static build: the whole point is that the agent edits src and
# the running page reflects it before Kane looks at it.
log "starting target app on :${APP_PORT}"
(cd target-app && npx vite --host 127.0.0.1 --port "$APP_PORT" --strictPort) &
APP_PID=$!

trap 'kill "$APP_PID" "${PROXY_PID:-}" 2>/dev/null || true' EXIT INT TERM

for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}"; then
    log "target app is up"
    break
  fi
  sleep 0.5
done
curl -sf -o /dev/null "http://127.0.0.1:${APP_PORT}" || die "target app never came up"

# --- orchestrator (foreground) -----------------------------------------------
log "starting orchestrator on :${PORT}"
export KANE_TARGET_URL="http://127.0.0.1:${APP_PORT}"
export PORT
cd server
exec npx tsx src/../index.ts 2>/dev/null || exec npx tsx index.ts
