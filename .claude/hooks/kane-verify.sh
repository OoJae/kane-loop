#!/usr/bin/env bash
# PostToolUse hook — the closing half of the loop.
#
# Fires the instant Claude saves a file in target-app/src. Runs the Kane suite
# against the live app in a real Chrome, and when Kane is red, feeds the failure
# reason straight back into Claude's context via additionalContext so the agent
# reads it on its next model request and fixes the code it just wrote.
set -u

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./kane-lib.sh
. "$SELF_DIR/kane-lib.sh"

KANE_PHASE="verify"
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"

# 1) Scope. Only app source changes are worth a browser run — otherwise the
#    agent editing a README would spawn Chrome, which is slow and silly.
case "$FILE" in
  *target-app/src/*) ;;
  *) exit 0 ;;
esac

# 2) Preconditions. Skip rather than report a misleading failure.
if ! kane_available; then
  emit_event skipped reason "kane-cli not on PATH"
  exit 0
fi
if ! dev_server_up; then
  emit_event skipped reason "dev server not reachable at $TARGET_URL"
  exit 0
fi

# 3) Concurrency. Several Edits can land in one turn and hooks run in parallel;
#    stacking Chrome sessions would burn wall-clock and credits.
if ! acquire_lock; then
  emit_event skipped reason "another Kane run is in flight"
  exit 0
fi

# Seal the oracle on the first verified save of a session. Sealing here rather
# than at the gate matters: the gate runs last, so a seal taken there would be
# taken *after* any tampering and would happily certify it.
[ -f "$ROOT/.kane-oracle.sha256" ] || oracle_seal

emit_event verify_start file "$FILE"
run_kane_suite

# Never report a pass for a suite that does not exist.
if [ "$KANE_FLOW_COUNT" -eq 0 ]; then
  emit_event verify_result status "unverified" detail "no *_test.md flows found in tests/"
  exit 0
fi

if [ -n "$KANE_FAILS" ]; then
  emit_event verify_result status "red" detail "$KANE_FAILS"

  # 4) Close the loop. additionalContext is wrapped in a system reminder and
  #    inserted at the point the hook fired; Claude reads it on the next model
  #    request. Cap well under the 10,000-char limit, actionable reason first.
  MSG="$(printf 'KANE VERIFICATION FAILED after your last edit.\n\n%s\n\nThis is a real browser run against the running app, not a unit test. Read the failure literally, fix the application code in target-app/src, and save — Kane re-runs automatically on every save. Do NOT edit anything in tests/.' "$KANE_FAILS" | head -c 4000)"
  jq -nc --arg ctx "$MSG" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
else
  emit_event verify_result status "green"
  MSG="KANE VERIFIED GREEN: every flow in tests/ passes against the running app after your last edit."
  jq -nc --arg ctx "$MSG" \
    '{hookSpecificOutput:{hookEventName:"PostToolUse",additionalContext:$ctx}}'
fi

exit 0
