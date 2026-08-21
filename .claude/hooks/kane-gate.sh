#!/usr/bin/env bash
# Stop hook — the spine.
#
# Claude cannot declare "done" while Kane is red. PostToolUse gives the fast
# feedback; this is the guarantee: even if a verify run was skipped (lock,
# scope, timeout), the agent physically cannot finish on a broken app.
set -u

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./kane-lib.sh
. "$SELF_DIR/kane-lib.sh"

KANE_PHASE="gate"
INPUT="$(cat)"

# 1) NON-NEGOTIABLE: if we are already continuing because this gate blocked,
#    let Claude stop. Without this the gate re-fires forever, burning credits
#    and hanging the demo.
if [ "$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
  emit_event gate_release reason "stop_hook_active — gate already engaged this turn"
  exit 0
fi

# 2) Escape hatch. If the gate has blocked repeatedly and the agent still can't
#    get to green, stop fighting: hand it back to a human rather than loop.
MAX_BLOCKS="${KANE_MAX_BLOCKS:-4}"
BLOCKS=0
[ -f "$FAILCOUNT" ] && BLOCKS="$(cat "$FAILCOUNT" 2>/dev/null || echo 0)"
case "$BLOCKS" in ''|*[!0-9]*) BLOCKS=0 ;; esac

if [ "$BLOCKS" -ge "$MAX_BLOCKS" ]; then
  emit_event gate_release reason "escape hatch: blocked $BLOCKS times, releasing for manual review"
  rm -f "$FAILCOUNT"
  exit 0
fi

# 3) Preconditions — never block on infrastructure we can't verify through.
if ! kane_available; then
  emit_event gate_release reason "kane-cli not on PATH"
  exit 0
fi
if ! dev_server_up; then
  emit_event gate_release reason "dev server not reachable at $TARGET_URL"
  exit 0
fi
if ! acquire_lock; then
  emit_event gate_release reason "another Kane run is in flight"
  exit 0
fi

emit_event gate_start
run_kane_suite

# An empty suite is not a pass. Release (there is nothing to block on) but never
# claim verification that did not happen.
if [ "$KANE_FLOW_COUNT" -eq 0 ]; then
  emit_event gate_release status "unverified" reason "no *_test.md flows found in tests/ — nothing was verified"
  exit 0
fi

if [ -z "$KANE_FAILS" ]; then
  # A green is only evidence if the oracle that produced it is the one we
  # started with. Denial stops the obvious edit routes; this catches the rest.
  if ! drift="$(oracle_verify)"; then
    emit_event gate_result status "tampered" detail "$drift"
    REASON="You are not done: ${drift}. Restore the flows and their cached recordings to their original state, then fix the application code in target-app/src so Kane passes against the untouched suite."
    jq -nc --arg r "$REASON" \
      '{decision:"block",reason:$r,
        hookSpecificOutput:{hookEventName:"Stop",permissionDecision:"deny",permissionDecisionReason:$r}}'
    printf '%s\n' "$REASON" >&2
    exit 2
  fi
  emit_event gate_result status "green" detail "gate released — every flow passes, oracle intact"
  rm -f "$FAILCOUNT"
  exit 0
fi

# 4) Red: block the stop and tell the agent exactly why.
BLOCKS=$((BLOCKS + 1))
printf '%s' "$BLOCKS" >"$FAILCOUNT"
emit_event gate_result status "red" detail "$KANE_FAILS" blocks "$BLOCKS"

REASON="$(printf 'Kane is still failing, so you are not done: %s\nFix the application code in target-app/src (never the tests) and save. Kane re-runs automatically on every save, and this completion gate re-checks it in a real browser when you try to finish.' "$KANE_FAILS" | head -c 4000)"

# Emit both documented block shapes. Recent Claude Code versions read the
# structured permissionDecision; older ones read decision/reason. Phase 2
# confirms which one this pinned version honours — emitting both costs nothing.
case "${KANE_GATE_MODE:-both}" in
  json|both)
    jq -nc --arg r "$REASON" \
      '{decision:"block",reason:$r,
        hookSpecificOutput:{hookEventName:"Stop",permissionDecision:"deny",permissionDecisionReason:$r}}'
    ;;
esac

# Exit 2 + stderr is the oldest, most stable block contract and is documented
# as preferred in current versions. Belt and suspenders: the gate is the one
# mechanism that must never silently fail open.
if [ "${KANE_GATE_MODE:-both}" = "json" ]; then
  exit 0
fi
printf '%s\n' "$REASON" >&2
exit 2
