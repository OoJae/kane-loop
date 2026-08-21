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

# 1) Bound the gate with a COUNTER, not with stop_hook_active.
#
#    stop_hook_active is true on every stop attempt after the gate has blocked
#    once. Releasing on it unconditionally — the obvious reading, and what this
#    hook used to do — means the gate blocks exactly ONCE and the agent may
#    finish red on its second attempt, with KANE_MAX_BLOCKS never reached. That
#    quietly falsifies the whole point of the gate.
#
#    The counter gives the same protection against an infinite loop (it is
#    strictly increasing and capped) while letting the gate actually hold.
STOP_ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)"
MAX_BLOCKS="${KANE_MAX_BLOCKS:-4}"
BLOCKS=0
[ -f "$FAILCOUNT" ] && BLOCKS="$(cat "$FAILCOUNT" 2>/dev/null || echo 0)"
case "$BLOCKS" in ''|*[!0-9]*) BLOCKS=0 ;; esac

# Safety net: the counter is only a bound if we can persist it. If the file is
# not writable, fall back to the old stop_hook_active behaviour rather than risk
# a gate that never lets go.
if ! printf '%s' "$BLOCKS" >"$FAILCOUNT" 2>/dev/null; then
  if [ "$STOP_ACTIVE" = "true" ]; then
    emit_event gate_release reason "cannot persist the block counter; honouring stop_hook_active"
    exit 0
  fi
fi

if [ "$BLOCKS" -ge "$MAX_BLOCKS" ]; then
  emit_event gate_release reason "escape hatch: blocked $BLOCKS times, releasing for manual review" blocks "$BLOCKS"
  rm -f "$FAILCOUNT"
  exit 0
fi

# 3) Integrity FIRST — before the infrastructure preconditions below.
#
# This is a pure filesystem checksum: it needs no kane-cli, no dev server and no
# lock. Running it after those checks meant any of their release paths could
# skip it entirely — stop the dev server, delete the flows, and the gate waved
# the agent through.
#
# This check used to sit below the empty-suite branch, which made the whole gate
# defeatable with one command: `rm -rf tests` emptied the suite, the branch below
# released, and the oracle was never consulted. Deleting the flows now moves the
# manifest, so it lands here and blocks.
if ! drift="$(oracle_verify)"; then
  # Count this block like any other. Exiting 2 without incrementing made the
  # escape hatch unreachable on this path — an unbounded block loop, which is
  # the one thing the counter exists to prevent.
  BLOCKS=$((BLOCKS + 1))
  printf '%s' "$BLOCKS" >"$FAILCOUNT" 2>/dev/null || true
  emit_event gate_result status "tampered" detail "$drift" blocks "$BLOCKS"
  REASON="You are not done: ${drift}. Restore the flows and their cached recordings to their original state, then fix the application code in target-app/src so Kane passes against the untouched suite."
  jq -nc --arg r "$REASON" \
    '{decision:"block",reason:$r,
      hookSpecificOutput:{hookEventName:"Stop",permissionDecision:"deny",permissionDecisionReason:$r}}'
  printf '%s\n' "$REASON" >&2
  exit 2
fi

# 4) Preconditions — never block on infrastructure we can't verify through.
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
# claim verification that did not happen. Reaching here means the oracle is
# intact, so an empty tests/ is how the repo actually is, not something the
# agent did this session.
if [ "$KANE_FLOW_COUNT" -eq 0 ]; then
  emit_event gate_release status "unverified" reason "no *_test.md flows found in tests/ — nothing was verified"
  exit 0
fi

if [ -z "$KANE_FAILS" ]; then
  emit_event gate_result status "green" detail "gate released — every flow passes, oracle intact"
  rm -f "$FAILCOUNT"
  exit 0
fi

# 5) Red: block the stop and tell the agent exactly why.
BLOCKS=$((BLOCKS + 1))
printf '%s' "$BLOCKS" >"$FAILCOUNT"
emit_event gate_result status "red" detail "$KANE_FAILS" blocks "$BLOCKS"

REASON="$(printf 'Kane is still failing, so you are not done: %s\nFix the application code in target-app/src (never the tests) and save. Kane re-runs automatically on every save, and this completion gate re-checks it in a real browser when you try to finish.' "$KANE_FAILS" | head -c 4000)"
if [ -n "${KANE_SHOT:-}" ]; then
  REASON="${REASON}

Kane's screenshot of the failing step is at ${KANE_SHOT} — open it with Read to see what the browser rendered."
fi

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
