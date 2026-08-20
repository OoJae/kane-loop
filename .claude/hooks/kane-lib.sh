#!/usr/bin/env bash
# Shared helpers for the Kane Loop hooks.
# Sourced by kane-verify.sh (PostToolUse) and kane-gate.sh (Stop).

# --- paths -------------------------------------------------------------------
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
EVENTS="$ROOT/.kane-events.ndjson"
STDERR_LOG="$ROOT/.kane-stderr.log"
LOCK="$ROOT/.kane.lock"
FAILCOUNT="$ROOT/.kane-failcount"
TARGET_URL="${KANE_TARGET_URL:-http://localhost:5173}"

# Which flows make up the suite. Overridable so a rehearsal can scope to one.
KANE_FLOW_GLOB="${KANE_FLOW_GLOB:-*_test.md}"

# Kane runs must finish inside the hook's timeout. Hooks are synchronous:
# a run that outlives this strangles the loop.
KANE_RUN_TIMEOUT="${KANE_RUN_TIMEOUT:-180}"

# --- event log ---------------------------------------------------------------
# Append a Kane Loop control event to the append-only NDJSON log. The
# orchestrator tails this file; it is the contract between hooks and server.
# Kane's own NDJSON is appended verbatim by run_kane_suite.
#
# Usage: emit_event <type> [key value]...
emit_event() {
  local type="$1"; shift
  local args=(--arg source "kane-loop" --arg type "$type" --arg phase "${KANE_PHASE:-}")
  local filter='{source:$source,type:$type,phase:$phase,ts:(now|todateiso8601)}'
  while [ "$#" -ge 2 ]; do
    args+=(--arg "k_$1" "$2")
    filter="$filter + {\"$1\":\$k_$1}"
    shift 2
  done
  jq -nc "${args[@]}" "$filter" >>"$EVENTS" 2>/dev/null
}

# Mirror a Kane run_end into the log as a first-class Kane Loop event, so the
# UI can render verdicts without re-deriving them from Kane's raw stream.
emit_flow_end() {
  local flow="$1" run_end="$2"
  printf '%s' "$run_end" | jq -c \
    --arg source "kane-loop" --arg flow "$flow" --arg phase "${KANE_PHASE:-}" \
    '{source:$source,type:"flow_end",phase:$phase,flow:$flow,ts:(now|todateiso8601),
      status:(.status//"error"),summary:(.summary//""),one_liner:(.one_liner//""),
      reason:(.reason//""),duration:(.duration//null),credits:(.credits//null),
      run_dir:(.run_dir//""),test_url:(.test_url//"")}' >>"$EVENTS" 2>/dev/null
}

# --- concurrency guard -------------------------------------------------------
# Claude can emit several Edit calls in one turn and matching hooks run in
# PARALLEL, so this must be atomic. mkdir is atomic; `touch` + `[ -e ]` races.
acquire_lock() {
  if mkdir "$LOCK" 2>/dev/null; then
    trap 'rmdir "$LOCK" 2>/dev/null' EXIT
    return 0
  fi
  # Stale lock recovery: a killed hook can leave the directory behind.
  if [ -d "$LOCK" ]; then
    local age
    age="$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))"
    if [ "$age" -gt 600 ]; then
      rmdir "$LOCK" 2>/dev/null
      if mkdir "$LOCK" 2>/dev/null; then
        trap 'rmdir "$LOCK" 2>/dev/null' EXIT
        return 0
      fi
    fi
  fi
  return 1
}

# --- preconditions -----------------------------------------------------------
# A dev server that is down produces "connection refused" failures that would
# send the agent debugging entirely the wrong thing. Better to skip the run.
dev_server_up() {
  curl -sf -o /dev/null --max-time 5 "$TARGET_URL"
}

kane_available() {
  command -v kane-cli >/dev/null 2>&1
}

# --- the one true parse ------------------------------------------------------
# run_end is documented as the terminal event and always the last stdout line.
# Progress events carry no `type` field at all, so select(.type=="run_end") is
# safe; plain grep is not (step prose could contain the substring).
#
# Runs every tests/*_test.md. Cached replays are fast and cost no LLM credits.
# Sets: KANE_FAILS      human-readable failure list, empty when everything is green
#       KANE_ANY_RAN    1 if at least one flow produced a verdict
#       KANE_FLOW_COUNT how many flow files were found
#
# An empty suite is NOT green. Callers must check KANE_FLOW_COUNT before
# treating an empty KANE_FAILS as verification — "no tests ran" reported as a
# pass is exactly the fake verification this project refuses to ship.
run_kane_suite() {
  KANE_FAILS=""
  KANE_ANY_RAN=0
  KANE_FLOW_COUNT=0
  local t run_end status reason name

  # shellcheck disable=SC2231  # glob must stay unquoted to expand
  for t in "$ROOT"/tests/$KANE_FLOW_GLOB; do
    [ -e "$t" ] || continue
    KANE_FLOW_COUNT=$((KANE_FLOW_COUNT + 1))
    name="$(basename "$t")"
    emit_event flow_start flow "$name"

    run_end="$(
      kane-cli testmd run "$t" --agent --headless --timeout "$KANE_RUN_TIMEOUT" \
        2>>"$STDERR_LOG" \
        | tee -a "$EVENTS" \
        | jq -c 'select(.type=="run_end")' 2>/dev/null | tail -1
    )"

    if [ -z "$run_end" ]; then
      # No terminal event: Kane errored (auth, infra, crash) rather than
      # reporting a verdict. Surface it honestly instead of calling it a pass.
      emit_event flow_error flow "$name" reason "no run_end event; see .kane-stderr.log"
      KANE_FAILS="${KANE_FAILS}[$name] Kane produced no verdict (auth/infra error — see .kane-stderr.log). "
      continue
    fi

    KANE_ANY_RAN=1
    status="$(printf '%s' "$run_end" | jq -r '.status // "error"')"
    emit_flow_end "$name" "$run_end"

    if [ "$status" != "passed" ]; then
      reason="$(printf '%s' "$run_end" | jq -r '.reason // .one_liner // .summary // "no reason reported"')"
      KANE_FAILS="${KANE_FAILS}[$name] ${reason} "
    fi
  done
}
