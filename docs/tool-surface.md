# Tool surface — verified facts (Phase 0)

Everything here was checked against the **installed** versions, not from memory or docs alone.
Where the build guide's reference code disagreed with reality, reality won and the delta is noted.

**Pinned versions (do not upgrade after Gate 2):**

| Tool | Version | Path |
|---|---|---|
| Kane CLI | **0.8.4** | `/opt/homebrew/bin/kane-cli` |
| Claude Code | **2.1.238** | `/opt/homebrew/bin/claude` |
| Node | v26.0.0 | |
| jq | 1.7.1 | |
| Chrome | installed (`/Applications/Google Chrome.app`) | |

> Claude Code was deliberately upgraded from the preinstalled 2.1.178 **before** any hook work.
> 2.1.178 predates two fixes that strike this project's exact mechanism: **v2.1.212** (hook
> timeouts misreported as user rejections, which silently stops unattended sessions) and
> **v2.1.214** (`continue:false`/`deny` stop decisions dropped when a tool fails mid-stream).

---

## 1. Kane CLI v0.8.4 — verified from `--help`

### Commands that exist
`run`, `testmd (run|list|status|delete|export)`, `testrun run`, `login`, `logout`, `whoami`,
`config`, `profiles`, `evidence (validate|serve|merge)`, `changelog`, `context`, `design tests`.

### Deltas from the build guide (guide was written against v0.4.0)

| Guide said | v0.8.4 reality |
|---|---|
| `kane-cli generate` turns English into a `_test.md` | ❌ **No `generate` command.** The authoring path is `context ingest` → `design tests`. Phase 4(a) generality must use the **template-authored + `chmod -w` fallback**, or `design tests`. |
| `kane-cli balance` shows credits | ❌ **No `balance` command** in v0.8.4 help. Credits are reported per run in `run_end.credits`; the dashboard is the balance source. |
| `--agent` emits NDJSON | ✅ Confirmed on both `run` and `testmd run` |
| `--headless` | ✅ Confirmed on both |
| exit codes 0/1/2/3 | ✅ Documented as pass / fail / error / timeout |
| `max_steps` frontmatter | ✅ Confirmed, plus `mode`, `timeout`, `headless`, `url`, `variables`, `global_context`, `local_context`, `code_export`, `code_language` |

### Flags worth knowing (verified in `run --help` / `testmd run --help`)
- `--agent` — "Agent mode: plain NDJSON output, no colors/UI". **Required for scripted use.**
- `--headless`, `--timeout <sec>`, `--max-steps <n>` (default **50**), `--url <url>`
- `--mode <action|testing>` — default `testing` (lenient); `action` hard-stops on auth/blocked/error
- `--assertion-mode <dom|visual>` — default `dom` (DOM extraction, vision fallback)
- `--final-validation <on|off>` — default **off**; appends a `cp_final` checkpoint verifying the objective as a whole
- `--bug-detection <off|stop|continue>` — detects product bugs *while authoring*
- `--cdp-endpoint` — attach to an existing Chrome (fallback if headless misbehaves)
- `testmd export <path> --language <py|js>` — standalone Playwright codegen (craft extra)
- `kane-cli evidence serve` — local viewer for sealed evidence packs (craft extra)

### NDJSON contract (the one true parse)
`run_end` is the **terminal event and always the last stdout line**. Progress events carry **no
`type` field at all**, so `select(.type=="run_end")` is safe where `grep` is not. Other typed
events: `bifurcation`, `child_agent_start`, `child_agent_end`, `ask_user`, `error`.

```bash
kane-cli testmd run ./tests/darkmode_test.md --agent --headless \
  | jq -c 'select(.type=="run_end")' | tail -1
```

`run_end` fields: `status` (`passed|failed`), `summary`, `one_liner`, `reason`, `duration`,
`credits`, `final_state`, `context`, `session_dir`, `run_dir`, `test_url`.
(`one_liner`, `duration`, `session_dir`, `run_dir` are **richer than the guide assumed** — the
hooks forward `run_dir` and `test_url` into the event log so the UI can deep-link evidence.)

### Artifact locations
- Session logs: `~/.testmuai/kaneai/sessions/<session-id>/`
- Run actions: `{run_dir}/run-test/actions.ndjson`
- Cached recordings: `output-<test-stem>/` — **commit-safe**
- Sealed evidence packs: project-local `.testmuai/evidence/*.evidence` — **gitignored**

### Caching / credits
Steps author on first run and replay from cache "in seconds with no LLM cost". **Editing step N
re-authors step N and every step after it** — this is why `tests/*_test.md` wording is frozen
after Gate 1 and the files are made read-only.

### ⏳ Still to verify (blocked on `kane-cli login`)
- [ ] A real captured `run_end` line → `evidence/first-run.ndjson`
- [ ] Observed exit codes from a real red and a real green run
- [ ] Cached-replay timing and credit delta (run the same testmd twice)
- [ ] Whether headless Chrome reaches `localhost:5173` cleanly

---

## 2. Claude Code 2.1.238 — hook schema

### PostToolUse
Input on stdin includes `hook_event_name`, `tool_name`, `tool_input.file_path`, `tool_use_id`,
`tool_result`, `cwd`, `session_id`, `permission_mode`.

Context injection back into the agent — **confirmed as the guide describes**:
```json
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}
```
`additionalContext` is capped at **10,000 characters** (we cap at 4,000). The string is wrapped in
a system reminder and inserted where the hook fired; Claude reads it on the next model request.
PostToolUse **cannot block** — the tool already ran.

### Stop
Input includes `stop_hook_active` (true once the gate has already blocked this turn),
`last_assistant_message`, `last_user_message`.

Blocking is supported two ways, and **this project emits both plus exit 2**, because the gate is
the one mechanism that must never fail open:
- legacy `{"decision":"block","reason":"..."}`
- structured `{"hookSpecificOutput":{"hookEventName":"Stop","permissionDecision":"deny","permissionDecisionReason":"..."}}`
- **exit code 2 with the reason on stderr** — the oldest, most stable contract

### Settings & execution
- `timeout` in `settings.json` is in **seconds** (we set 300). Default is 600s.
- `$CLAUDE_PROJECT_DIR` **is** set for hook commands; the quoted form
  `"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/foo.sh"` is the documented recommendation — load-bearing
  here because this repo's path contains a space.
- Matcher `Edit|Write|MultiEdit` is valid (pipe or comma separators).
- **All matching hooks for an event run in parallel** → the concurrency lock must be atomic.
  `mkdir` is; `touch` + `[ -e ]` races. The guide's reference code used `touch` — **changed**.
- **Hooks fire in `-p` (headless) mode** from the project's `.claude/settings.json`. Exception:
  `--bare` skips hooks entirely.
- `--verbose` + `--output-format stream-json` surfaces `hook_started` / `hook_response` events —
  useful for rendering the loop in the UI transcript.

---

## 3. Hook harness tests (run with piped JSON — no Kane, no Claude)

All passed against the real scripts:

| # | Scenario | Expected | Result |
|---|---|---|---|
| 1 | PostToolUse on `README.md` | silent, exit 0, no browser run | ✅ exit 0, no events |
| 2 | PostToolUse on `target-app/src/App.tsx`, dev server down | skip cleanly | ✅ `skipped: dev server not reachable` |
| 3 | Stop with `stop_hook_active:true` | release immediately | ✅ `gate_release`, exit 0 |
| 4 | Stop with **no `*_test.md` present** | must NOT claim green | ✅ `unverified` *(see bug below)* |
| 5 | Stop with 4 prior blocks | escape hatch releases | ✅ released, counter cleared |
| 6 | Stop with a stubbed **failing** Kane | block + reason + exit 2 | ✅ both JSON shapes on stdout, reason on stderr, exit 2 |
| 7 | PostToolUse with a stubbed failing Kane | inject `additionalContext` | ✅ failure reason injected verbatim |

> **Fail-open bug caught and fixed during harness testing.** With an empty `tests/` directory the
> first version of the gate reported **green — "every flow passes"** and released. An empty suite
> is not a pass. Both hooks now track `KANE_FLOW_COUNT` and report `unverified` instead, so the
> loop can never claim verification that did not happen.

> The stubbed `kane-cli` used in tests 6–7 was a throwaway fixture on `PATH`, deleted immediately
> afterwards. **No stub, mock, or simulated verdict exists anywhere in the shipped project** —
> every RED and GREEN in the demo comes from a real Kane run.
