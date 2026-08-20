#!/usr/bin/env bash
# One command: target app (5173) + orchestrator (4000) + Kane Loop UI (4321).
# Clean clone to running in well under 30 seconds.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_PORT=5173
SERVER_PORT=4000
WEB_PORT=4321

say() { printf '\033[1;36m▸\033[0m %s\n' "$1"; }

# --- free stale listeners ----------------------------------------------------
for port in "$APP_PORT" "$SERVER_PORT" "$WEB_PORT"; do
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    say "port $port busy — clearing"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
done

# --- install on first run ----------------------------------------------------
for dir in target-app server web; do
  if [ -f "$ROOT/$dir/package.json" ] && [ ! -d "$ROOT/$dir/node_modules" ]; then
    say "installing $dir dependencies (first run only)"
    (cd "$ROOT/$dir" && npm install --silent) || { echo "npm install failed in $dir"; exit 1; }
  fi
done

PIDS=()
cleanup() {
  echo
  say "shutting down"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

start() { # start <label> <dir>
  say "starting $1"
  (cd "$ROOT/$2" && npm run dev) &
  PIDS+=("$!")
}

start "target app  → http://localhost:$APP_PORT" target-app
[ -f "$ROOT/server/package.json" ] && start "orchestrator → http://localhost:$SERVER_PORT" server
[ -f "$ROOT/web/package.json" ]    && start "Kane Loop UI → http://localhost:$WEB_PORT" web

# --- wait for readiness ------------------------------------------------------
wait_for() { # wait_for <url> <label>
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "$1" && { say "ready: $2"; return 0; }
    sleep 0.5
  done
  say "WARNING: $2 did not come up"
  return 1
}

wait_for "http://localhost:$APP_PORT" "target app"
[ -f "$ROOT/server/package.json" ] && wait_for "http://localhost:$SERVER_PORT/health" "orchestrator"
[ -f "$ROOT/web/package.json" ]    && wait_for "http://localhost:$WEB_PORT" "Kane Loop UI"

cat <<EOF

  ┌────────────────────────────────────────────┐
  │  Kane Loop is up                           │
  │                                            │
  │  UI          http://localhost:$WEB_PORT        │
  │  Target app  http://localhost:$APP_PORT        │
  │  Orchestrator http://localhost:$SERVER_PORT       │
  └────────────────────────────────────────────┘

  Ctrl-C to stop everything.

EOF

wait
