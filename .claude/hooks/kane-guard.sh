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
STATE_MSG="That file is the verifier's own state — the block counter and the integrity seal. Writing it would switch off the completion gate rather than satisfy it. Fix the application code in target-app/src instead."

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
      # The gate's own state. .kane-failcount is load-bearing: the Stop gate
      # releases without verifying anything once it reads >= KANE_MAX_BLOCKS, so
      # a single write of "4" here switches the gate off. .kane-oracle.sha256 is
      # the integrity baseline, so a write there forges the seal.
      */.kane-failcount|*/.kane-oracle.sha256|*/.kane-events.ndjson)
        deny "$FILE" "$STATE_MSG" ;;
    esac
    ;;
esac

# --- shell writes ------------------------------------------------------------
# PreToolUse matchers are per-tool, so a Bash redirect would sail straight past
# the block above. This is intentionally conservative: it only fires when the
# command both mentions a protected path and looks like it mutates something.
if [ "$TOOL" = "Bash" ] && [ -n "$CMD" ]; then
  # Strip the redirects that mean "discard noise", not "write a file". Without
  # this, `ls tests/ 2>/dev/null` contains a ">" and was denied — which stopped
  # the agent READING the spec. Reading the objective is legitimate.
  SAFE_CMD="$(printf '%s' "$CMD" | sed -E 's/[0-9]*>>?[[:space:]]*\/dev\/null//g; s/[0-9]*>&[0-9]//g')"

  # Some commands rewrite files chosen by their INPUT, not by their arguments:
  # `git apply patch`, `patch < p`, `tar -x`, `unzip`, `git stash pop` can all
  # land on tests/ without ever naming it, so a per-segment path check cannot
  # see them. Deny them outright while a session is running; the agent has no
  # legitimate need to replay a patch or restore a tree mid-loop.
  case "$SAFE_CMD" in
    *"git apply"*|*"git am"*|*"git stash"*|*"git checkout"*|*"git restore"*|*"git reset"*|*"git revert"*|*"git clean"*|*"patch "*|*"tar -x"*|*"tar x"*|*"unzip "*)
      deny "$CMD" "$TESTS_MSG"
      ;;
  esac

  case "$SAFE_CMD" in
    *tests/*|*.claude/*|*kane-loop.config.json*|*.kane-failcount*|*.kane-oracle.sha256*|*.kane-events.ndjson*)
      # Default-deny, with an allowlist of read-only verbs.
      #
      # Enumerating the ways to write a file is whack-a-mole and it lost: the
      # first version of this let `git checkout HEAD~5 -- tests/foo` through,
      # which silently swaps in an older oracle. So do it the other way round —
      # if a command touches the oracle, every segment of it has to be
      # something that only reads.
      #
      # Split on && || ; and | so `cd x && cat y` is judged per segment.
      # NOTE the trailing newline on both printfs: `while read` discards a final
      # line that is not newline-terminated, which silently made this whole
      # branch a no-op the first time it was written.
      # Single-line pattern on purpose: a backslash-continued case pattern
      # embeds the next line's indentation into the alternatives, so half the
      # verbs silently stop matching.
      READ_ONLY_VERBS="cat ls head tail grep egrep fgrep rg wc find file stat diff jq awk cut sort uniq echo printf cd pwd test true false less more od xxd basename dirname realpath readlink tree du shasum md5 md5sum sha256sum column nl comm join strings env export which type"

      verdict=allow
      # A redirect into a protected path is a write no matter how safe the verb
      # looks — `echo x > tests/foo` starts with `echo`.
      case "$SAFE_CMD" in
        *">"*) verdict=deny ;;
      esac

      if [ "$verdict" = allow ]; then
        # Split on ; | & so `cd x && cat y` is judged per segment. The trailing
        # newline matters: `while read` drops a final unterminated line, which
        # silently made this whole branch a no-op the first time it was written.
        while IFS= read -r seg; do
          case "$seg" in
            *tests/*|*.claude/*|*kane-loop.config.json*|*.kane-failcount*|*.kane-oracle.sha256*|*.kane-events.ndjson*) ;;
            *) continue ;;
          esac
          verb="$(printf '%s\n' "$seg" \
            | sed -E 's/^[[:space:]]*//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//; s/^sudo[[:space:]]+//' \
            | awk '{print $1}' | sed 's|.*/||')"
          [ -z "$verb" ] && continue
          # sed only mutates with -i.
          if [ "$verb" = sed ]; then
            case "$seg" in *"-i"*) verdict=deny; break ;; *) continue ;; esac
          fi
          case " $READ_ONLY_VERBS " in
            *" $verb "*) continue ;;
            *) verdict=deny; break ;;
          esac
        done <<EOF
$(printf '%s\n' "$SAFE_CMD" | tr ';|&' '\n')
EOF
      fi

      [ "$verdict" = deny ] && deny "$CMD" "$TESTS_MSG"
      ;;
  esac
fi

exit 0
