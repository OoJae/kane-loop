#!/usr/bin/env bash
# Shared helpers for the Kane Loop hooks.
# Sourced by kane-verify.sh (PostToolUse) and kane-gate.sh (Stop).

# --- paths -------------------------------------------------------------------
# Derive the repo root from THIS FILE's location (<repo>/.claude/hooks/), never
# from $CLAUDE_PROJECT_DIR or $PWD. The headless agent runs with cwd=target-app/,
# so the project dir is target-app/ — resolving from it would look for tests/ and
# the event log one level too deep and the loop would silently never verify.
KANE_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$KANE_LIB_DIR/../.." && pwd)"
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
  local flow="$1" verdict="$2" run_end="$3" credits="$4" headline="$5" duration="${6:-}"
  printf '%s' "$run_end" | jq -c \
    --arg source "kane-loop" --arg flow "$flow" --arg phase "${KANE_PHASE:-}" \
    --arg status "$verdict" --arg credits "$credits" --arg headline "$headline" \
    --arg duration "$duration" \
    '{source:$source,type:"flow_end",phase:$phase,flow:$flow,ts:(now|todateiso8601),
      status:$status,summary:(.summary//""),one_liner:$headline,
      reason:(.reason//""),duration:(($duration|tonumber?)//.duration//null),
      credits:(($credits|tonumber?)//null),
      reason_code:(.reason_code//""),
      run_dir:(.run_dir//""),session_dir:(.session_dir//""),
      test_url:(.test_url//.final_url//"")}' \
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
    # credits_consumed lives INSIDE run_end.verdict on v0.8.4, not at the top
    # level as the docs imply. Reading only the top level reports 0 every time.
    credits="$(jq -s '[.[] | select(.type=="run_end")
                      | (.credits_consumed // .verdict.credits_consumed // .credits // 0)]
                      | add // 0' <"$raw" 2>/dev/null)"

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

    # test_md_summary.overall_status is the file-level verdict and the cleanest
    # signal Kane emits for a testmd run. It has agreed with the exit code on
    # every observed run; where they disagree, a non-pass wins.
    local overall total_duration
    overall="$(jq -r 'select(.type=="test_md_summary") | .overall_status // empty' <"$raw" 2>/dev/null | tail -1)"
    # The whole-file duration. run_end.duration is PER STEP, so reporting it as
    # the flow duration showed "150ms" for a 26-second browser run.
    total_duration="$(jq -r 'select(.type=="test_md_summary") | .duration_s // empty' <"$raw" 2>/dev/null | tail -1)"
    if [ -n "$overall" ] && [ "$overall" != "passed" ]; then
      status="failed"
    fi
    # A non-passing per-step run_end also outranks a zero exit code.
    if [ "$status" = "passed" ] && \
       [ "$(printf '%s' "$run_end" | jq -r '.status // "error"')" != "passed" ]; then
      status="failed"
    fi

    # Name the step and the assertion that broke. This is done for every run so
    # the emitted event can carry a truthful headline.
    #
    # We deliberately never read run_end.verdict.* here. On a real failure it
    # contained: one_liner "The replay failed because it expected a dark page
    # state that was not present", and suggestion "Update the test to explicitly
    # turn on dark mode". Kane blames the test for the app's bug — surfacing that
    # would push the agent to weaken ground truth. The literal failed assertion
    # is the honest, actionable signal.
    local step heading assertion headline
    step="$(jq -r 'select(.type=="test_md_step_end" and .status!="passed") | .step_index' <"$raw" 2>/dev/null | head -1)"
    heading=""
    if [ -n "$step" ]; then
      heading="$(jq -r --argjson i "$step" 'select(.type=="test_md_step_start" and .step_index==$i) | .heading' <"$raw" 2>/dev/null | head -1)"
    fi
    assertion="$(jq -r 'select(.type=="step_end" and .status=="failed") | .summary // empty' <"$raw" 2>/dev/null | head -1)"
    assertion="${assertion#assert: }"

    if [ "$status" = "passed" ]; then
      headline="all steps passed"
    elif [ -n "$assertion" ]; then
      headline="failed assertion: ${assertion}"
    else
      headline="$status"
    fi

    emit_flow_end "$name" "$status" "$run_end" "$credits" "$headline" "$total_duration"

    if [ "$status" != "passed" ]; then
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

# --- oracle integrity --------------------------------------------------------
# Denial (kane-guard.sh) stops the obvious routes. This catches every other one:
# a checksum over the flows and their cached recordings, taken when the suite is
# known-good and re-checked at the gate. If the oracle moved during a session,
# any green it produced is not evidence.
#
# Deliberately covers output-<stem>/ as well as the .md — the cached recording
# is what Kane replays, so it is the more valuable thing to tamper with.
oracle_manifest() {
  # -print0/-0: this repo's path contains a space, and plain xargs splits on it
  # (which silently hashed nothing at all the first time round).
  # Sorting the shasum output rather than the filenames keeps it deterministic
  # without needing a null-aware sort.
  # Only the oracle itself: the objectives, and the recorded actions Kane
  # replays. meta.json / execution.json are Kane's own run bookkeeping and are
  # rewritten on every single run, so including them would flag Kane's normal
  # operation as tampering.
  find "$ROOT/tests" -type f \( -name '*_test.md' -o -name 'actions.ndjson' \) \
    -not -path '*/pending/*' -print0 2>/dev/null \
    | xargs -0 shasum -a 256 2>/dev/null \
    | LC_ALL=C sort \
    | shasum -a 256 2>/dev/null | awk '{print $1}'
}

oracle_seal() {
  local m; m="$(oracle_manifest)"
  [ -n "$m" ] && printf '%s' "$m" >"$ROOT/.kane-oracle.sha256"
}

# Echoes a human-readable problem and returns 1 when the oracle has changed.
oracle_verify() {
  local expected actual
  [ -f "$ROOT/.kane-oracle.sha256" ] || { oracle_seal; return 0; }
  expected="$(cat "$ROOT/.kane-oracle.sha256" 2>/dev/null)"
  actual="$(oracle_manifest)"
  [ -z "$actual" ] && return 0
  if [ "$expected" != "$actual" ]; then
    echo "the Kane flows or their cached recordings changed during this session (oracle checksum ${expected:0:12}… → ${actual:0:12}…), so any pass since then is not evidence"
    return 1
  fi
  return 0
}
