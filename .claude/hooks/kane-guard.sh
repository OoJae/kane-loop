#!/usr/bin/env bash
# PreToolUse hook — the thing that makes a green trustworthy.
#
# A closed loop is only worth as much as its oracle. The cheapest way for an
# agent to turn red into green is not to fix the app — it's to weaken the test.
# ImpossibleBench (arXiv 2510.20270) measured frontier models taking exactly
# that shortcut on 76% of tasks where the spec and the tests conflict, and found
# the fix is simply to put the oracle out of reach.
#
# Kane objectives are plain-English sentences in a markdown file, which makes
# them the softest possible target. This hook denies writes to them, to the
# cached recordings Kane actually replays, and to the hook configuration itself.
# The denial reason is fed back to the agent, so it learns the boundary instead
# of just bouncing off it.
set -u

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./kane-lib.sh
. "$SELF_DIR/kane-lib.sh"

KANE_PHASE="guard"
INPUT="$(cat)"

TOOL="$(printf '%s' "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)"
FILE="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)"

deny() {
  local what="$1" why="$2"
  emit_event guard_deny target "$what" reason "$why"
  jq -nc --arg r "$why" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",
                          permissionDecision:"deny",
                          permissionDecisionReason:$r}}'
  exit 0
}

TESTS_MSG="Kane's test flows are immutable ground truth — they are the only reason a green means anything, so the loop will not let you edit them. If the flow looks wrong, say so in your reply and stop; do not work around it. Otherwise fix the application code in target-app/src and save, and Kane will re-run."
CONFIG_MSG="The verification hooks and their settings are off limits — an agent that can switch off its own verifier isn't verified. Fix the application code in target-app/src instead."

# --- file writes -------------------------------------------------------------
case "$TOOL" in
  Edit|Write|MultiEdit|NotebookEdit)
    case "$FILE" in
      # The objectives themselves, AND output-<stem>/ — the cached recordings
      # Kane actually replays. Rewriting a cached action is a far more effective
      # way to fake a pass than editing the prose, so both are protected.
      */tests/*)            deny "$FILE" "$TESTS_MSG" ;;
      */.claude/*)          deny "$FILE" "$CONFIG_MSG" ;;
      */kane-loop.config.json) deny "$FILE" "$CONFIG_MSG" ;;
    esac
    ;;
esac

# --- shell writes ------------------------------------------------------------
# PreToolUse matchers are per-tool, so a Bash redirect would sail straight past
# the block above. This is intentionally conservative: it only fires when the
# command both mentions a protected path and looks like it mutates something.
if [ "$TOOL" = "Bash" ] && [ -n "$CMD" ]; then
  # Strip the redirects that mean "discard noise", not "write a file".
  # Without this, `ls -la tests/ 2>/dev/null` and `cat tests/foo 2>/dev/null`
  # both contain a ">" and were denied — which stopped the agent READING the
  # spec. Reading the objective is legitimate and useful; only writing is not.
  SAFE_CMD="$(printf '%s' "$CMD" | sed -E 's/[0-9]*>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>&[0-9]//g')"
  case "$SAFE_CMD" in
    *tests/*|*.claude/*)
      case "$SAFE_CMD" in
        *">"*|*"tee "*|*"sed -i"*|*"rm "*|*"mv "*|*"cp "*|*"chmod"*|*"truncate"*|*"dd "*|*"python"*|*"node -e"*|*"perl "*)
          deny "$CMD" "$TESTS_MSG"
          ;;
      esac
      ;;
  esac
fi

exit 0
