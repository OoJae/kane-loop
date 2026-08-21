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
warn() { printf '\033[1;33m!\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
# Without jq the hooks exit silently and the UI sits at IDLE forever with no
# error — the worst possible failure because it looks like nothing is wrong.
command -v jq >/dev/null 2>&1 || die "jq is required by the Kane hooks (brew install jq)"
command -v node >/dev/null 2>&1 || die "node is required"
# The one binary the entire demo depends on, and the only one that was unchecked.
command -v claude >/dev/null 2>&1 || \
  warn "claude CLI not found — POST /run will fail (npm i -g @anthropic-ai/claude-code)"

if command -v kane-cli >/dev/null 2>&1; then
  # whoami is free. An expired token makes every run fail as if the app were
  # broken, which sends the agent off fixing code that was never wrong.
  if ! kane-cli whoami 2>/dev/null | grep -q "Authenticated"; then
    warn "kane-cli is not authenticated — run: kane-cli login --oauth"
    warn "until then Kane cannot verify anything and the loop will not close."
  fi
else
  warn "kane-cli not found — install with: npm i -g @testmuai/kane-cli"
fi

# Tests are ground truth. Git stores them 100644, so a fresh clone gets them
# writable; re-assert read-only on every boot rather than trusting the clone.
if compgen -G "$ROOT/tests/*_test.md" >/dev/null; then
  chmod -w "$ROOT"/tests/*_test.md 2>/dev/null || true
fi

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
for dir in target-app server web mcp; do
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

# Track whether everything actually came up. This used to print "Kane Loop is up"
# unconditionally — wait_for only warned — so a judge whose orchestrator failed to
# start still got a confident success banner and then a dead UI.
READY=1
wait_for "http://localhost:$APP_PORT" "target app" || READY=0
if [ -f "$ROOT/server/package.json" ]; then
  wait_for "http://localhost:$SERVER_PORT/health" "orchestrator" || READY=0
fi
if [ -f "$ROOT/web/package.json" ]; then
  wait_for "http://localhost:$WEB_PORT" "Kane Loop UI" || READY=0
fi

if [ "$READY" -eq 1 ]; then
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
else
  printf '\033[1;31m✗ one or more services did not come up — see the log above.\033[0m\n' >&2
  printf '  The loop will not close until all three are running.\n\n' >&2
fi

wait
