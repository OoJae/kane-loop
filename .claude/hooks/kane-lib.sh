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

# Mirror a Kane verdict into the log as a first-class Kane Loop event, so the
# UI can render it without re-deriving anything from Kane's raw stream.
#
# NOTE: `credits_consumed` is the real field name (v0.8.4) — the docs and the
# build guide both say `credits`. Both are read, real name first.
emit_flow_end() {
  local flow="$1" verdict="$2" run_end="$3" credits="$4"
  printf '%s' "$run_end" | jq -c \
    --arg source "kane-loop" --arg flow "$flow" --arg phase "${KANE_PHASE:-}" \
    --arg status "$verdict" --arg credits "$credits" \
    '{source:$source,type:"flow_end",phase:$phase,flow:$flow,ts:(now|todateiso8601),
      status:$status,summary:(.summary//""),one_liner:(.one_liner//""),
      reason:(.reason//""),duration:(.duration//null),
      credits:(($credits|tonumber?)//null),
      reason_code:(.reason_code//""),
      run_dir:(.run_dir//""),session_dir:(.session_dir//""),test_url:(.test_url//"")}' \
    >>"$EVENTS" 2>/dev/null
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

    # Capture to a file rather than a pipeline, so the process exit code is
    # readable. The exit code is the authoritative verdict:
    #   0 passed · 1 failed · 2 error · 3 timeout
    local raw rc credits
    raw="$(mktemp -t kaneloop)"
    kane-cli testmd run "$t" --agent --headless --timeout "$KANE_RUN_TIMEOUT" \
      >"$raw" 2>>"$STDERR_LOG"
    rc=$?
    cat "$raw" >>"$EVENTS"

    # A testmd run emits ONE run_end PER STEP, not one per file. `tail -1` alone
    # would report the last step's verdict and miss an earlier failure, so take
    # the first failing run_end when there is one and fall back to the last.
    run_end="$(jq -c 'select(.type=="run_end" and .status!="passed")' <"$raw" 2>/dev/null | head -1)"
    [ -z "$run_end" ] && run_end="$(jq -c 'select(.type=="run_end")' <"$raw" 2>/dev/null | tail -1)"
    credits="$(jq -s '[.[] | select(.type=="run_end") | (.credits_consumed // .credits // 0)] | add // 0' <"$raw" 2>/dev/null)"

    if [ -z "$run_end" ]; then
      # No verdict at all: Kane errored (auth, infra, crash) before reporting.
      # Surface it honestly instead of letting it read as a pass.
      rm -f "$raw"
      emit_event flow_error flow "$name" reason "no run_end event (exit $rc); see .kane-stderr.log"
      KANE_FAILS="${KANE_FAILS}[$name] Kane produced no verdict (exit $rc — see .kane-stderr.log). "
      continue
    fi

    KANE_ANY_RAN=1
    case "$rc" in
      0) status="passed" ;;
      1) status="failed" ;;
      3) status="timeout" ;;
      *) status="error" ;;
    esac
    # Belt and braces: a non-passing run_end outranks a zero exit code.
    if [ "$status" = "passed" ] && \
       [ "$(printf '%s' "$run_end" | jq -r '.status // "error"')" != "passed" ]; then
      status="failed"
    fi

    emit_flow_end "$name" "$status" "$run_end" "$credits"

    if [ "$status" != "passed" ]; then
      # Name the step that failed — the agent needs to know which assertion broke.
      local step
      step="$(jq -r 'select(.type=="test_md_step_end" and .status!="passed") | .step_index' <"$raw" 2>/dev/null | head -1)"
      local heading=""
      if [ -n "$step" ]; then
        heading="$(jq -r --argjson i "$step" 'select(.type=="test_md_step_start" and .step_index==$i) | .heading' <"$raw" 2>/dev/null | head -1)"
      fi
      # Prefer the failed ASSERTION text over run_end.reason/summary. The
      # assertion is literal and actionable ("the page background is still dark
      # after the reload"); Kane's run-level summary can editorialise about its
      # own wiring, which would send the agent debugging the test instead of
      # the app.
      local assertion
      assertion="$(jq -r 'select(.type=="step_end" and .status=="failed") | .summary // empty' <"$raw" 2>/dev/null | head -1)"
      assertion="${assertion#assert: }"
      reason="$(printf '%s' "$run_end" | jq -r '.reason // .one_liner // "no reason reported"')"

      if [ -n "$assertion" ]; then
        reason="failed assertion: \"${assertion}\" (${reason})"
      fi
      if [ -n "$heading" ] && [ "$heading" != "null" ]; then
        KANE_FAILS="${KANE_FAILS}[$name] step \"$heading\" ${status} — ${reason} "
      else
        KANE_FAILS="${KANE_FAILS}[$name] ${status} — ${reason} "
      fi
    fi
    rm -f "$raw"
  done
}
