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

# Maintainer escape hatch. Hooks inherit Claude Code's own environment, not the
# environment of a Bash tool call, so an agent CANNOT set this for itself:
# `KANE_HOOKS_OFF=1 rm tests/foo` inside a session never reaches this process.
# It has to be exported before `claude` starts, which only a human can do.
#
# This exists because the guard once locked its own author out of the repo —
# editing .claude/ was denied via both Bash and the Edit tool, and hook config is
# cached at session start, so the only way out was restarting the session.
if [ "${KANE_HOOKS_OFF:-}" = "1" ]; then exit 0; fi

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./kane-lib.sh
. "$SELF_DIR/kane-lib.sh"

KANE_PHASE="guard"
INPUT="$(cat)"

# Seal the oracle on the FIRST tool call of a session, not on the first verified
# save. kane-verify.sh only fires after an edit to target-app/src, so anything
# done to tests/ before that was previously folded into the baseline and then
# certified as intact. This hook runs before any write, so it is the earliest
# honest moment to take the fingerprint.
[ -f "$ROOT/.kane-oracle.sha256" ] || oracle_seal

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
      # Anchored to $ROOT. Bare */tests/* and */.claude/* matched those
      # directory names ANYWHERE on the filesystem — including the user's
      # own ~/.claude, which is not this project's business to protect.
      "$ROOT"/tests/*)      deny "$FILE" "$TESTS_MSG" ;;
      "$ROOT"/.claude/*)    deny "$FILE" "$CONFIG_MSG" ;;
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

  # A heredoc body is DATA, not code. Without this, writing a file whose
  # CONTENT merely names a protected path — a commit message, a .dockerignore
  # — was parsed as though each of its lines were a command, and denied.
  # The delimiter line is kept, so `cat <<EOF > <protected>` is still caught
  # by the redirect check below.
  SAFE_CMD="$(printf '%s\n' "$SAFE_CMD" | awk '
    BEGIN { in_doc = 0 }
    {
      if (in_doc) { if ($0 == delim) { in_doc = 0 }; next }
      if (match($0, /<<-?[[:space:]]*'"'"'?[A-Za-z_][A-Za-z0-9_]*'"'"'?/)) {
        d = substr($0, RSTART, RLENGTH)
        sub(/^<<-?[[:space:]]*/, "", d); gsub(/'"'"'/, "", d)
        delim = d; in_doc = 1
      }
      print
    }')"

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
    *tests*|*.claude*|*kane-loop.config.json*|*.kane-failcount*|*.kane-oracle.sha256*|*.kane-events.ndjson*|*.kane.lock*)
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
      # A redirect whose TARGET is protected is a write however safe the verb
      # looks — `echo x > tests/foo` starts with `echo`. Match the target
      # specifically: a blanket ">" test denied a literal "->" inside a curl
      # format string, which is not a redirect at all.
      if printf '%s\n' "$SAFE_CMD" | grep -Eq '>>?[[:space:]]*"?'"'"'?[^[:space:]]*(tests|\.claude|\.kane-|kane-loop\.config)'; then
        verdict=deny
      fi

      if [ "$verdict" = allow ]; then
        # Split on ; | & so `cd x && cat y` is judged per segment. The trailing
        # newline matters: `while read` drops a final unterminated line, which
        # silently made this whole branch a no-op the first time it was written.
        # Once the shell has cd'd into protected territory, later segments no
        # longer need to NAME it — `cd tests && rm -f darkmode_test.md` was
        # allowed because the `rm` segment contains no path at all.
        cwd_protected=0
        while IFS= read -r seg; do
          case "$seg" in
            *tests*|*.claude*|*kane-loop.config.json*|*.kane-failcount*|*.kane-oracle.sha256*|*.kane-events.ndjson*|*.kane.lock*) ;;
            *) [ "$cwd_protected" -eq 1 ] || continue ;;
          esac
          # Strip leading whitespace, shell keywords (`do`/`then`/`else`/... were
          # being read AS the verb), env assignments, and sudo.
          verb="$(printf '%s\n' "$seg" \
            | sed -E 's/^[[:space:]]*//; s/^(do|then|else|elif|fi|done|:)[[:space:]]+//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)*//; s/^sudo[[:space:]]+//' \
            | awk '{print $1}' | sed 's|.*/||')"
          [ -z "$verb" ] && continue
          # A cd into protected territory arms every following segment.
          if [ "$verb" = cd ]; then
            case "$seg" in
              *tests*|*.claude*) cwd_protected=1 ;;
            esac
            continue
          fi
          # sed only mutates with -i.
          if [ "$verb" = sed ]; then
            case "$seg" in *"-i"*) verdict=deny; break ;; *) continue ;; esac
          fi
          # find only reads until it is told to act.
          if [ "$verb" = find ]; then
            case "$seg" in
              *-delete*|*-exec*|*-execdir*|*-ok*) verdict=deny; break ;;
              *) continue ;;
            esac
          fi
          case " $READ_ONLY_VERBS " in
            *" $verb "*) continue ;;
            *) verdict=deny; break ;;
          esac
        # KNOWN FALSE POSITIVE, accepted deliberately: a "|" inside quotes is a
        # separator here too, so `jq 'select(.a)|.b' .kane-events.ndjson` splits
        # into a fragment whose first word is `.b'` and gets denied. The obvious
        # fix — blanking quoted spans before splitting — is worse: it would also
        # blank the path in `rm -f "tests/darkmode_test.md"`, turning a read
        # inconvenience into a write bypass. A denied read costs a retry; a
        # missed write costs the whole guarantee.
        done <<EOF
$(printf '%s\n' "$SAFE_CMD" | tr ';|&' '\n')
EOF
      fi

      [ "$verdict" = deny ] && deny "$CMD" "$TESTS_MSG"
      ;;
  esac
fi

exit 0
