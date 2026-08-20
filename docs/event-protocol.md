# Kane Loop event protocol

The contract between the hooks, the orchestrator, and the UI. Everything the UI
renders comes from here — there is no other channel.

## Transport

`.kane-events.ndjson` at the repo root is **append-only**. Hooks write; the
orchestrator tails it (`fs.watch` + incremental read from a byte offset) and
broadcasts each new line to WebSocket clients. Because it is a file, a session
can be replayed from scratch and a dropped socket recovers by re-reading.

Two kinds of line appear in the file:

1. **Kane's own NDJSON, verbatim** — piped through `tee` by the hooks. Progress
   events have no `type` field; typed ones include `run_end`, `error`,
   `ask_user`, `bifurcation`, `child_agent_start`, `child_agent_end`.
2. **Kane Loop control events** — every one carries `"source":"kane-loop"`.

**The UI must filter on `source === "kane-loop"` for loop state**, and may render
raw Kane lines as a receipts feed. Only `run_end` (mirrored as `flow_end`) is a
verdict — never infer pass/fail from anything else.

## Kane Loop control events

Common fields: `source` (always `"kane-loop"`), `type`, `phase`
(`"verify"` from the PostToolUse hook, `"gate"` from the Stop hook), `ts` (ISO 8601).

| `type` | Extra fields | Meaning |
|---|---|---|
| `verify_start` | `file` | A save in `target-app/src` triggered a run |
| `gate_start` | — | The agent tried to stop; the gate is re-checking |
| `flow_start` | `flow` | One `*_test.md` is starting |
| `flow_end` | `flow`, `status`, `summary`, `one_liner`, `reason`, `duration`, `credits`, `run_dir`, `test_url` | **A verdict.** `status` is `passed` / `failed` / `error` |
| `flow_error` | `flow`, `reason` | Kane produced no `run_end` (auth/infra failure) |
| `verify_result` | `status` (`red`/`green`/`unverified`), `detail` | Result of a post-save run |
| `gate_result` | `status` (`red`/`green`), `detail`, `blocks` | Gate verdict; `red` means the agent was blocked |
| `gate_release` | `reason`, sometimes `status` | Gate let the agent finish, and why |
| `skipped` | `reason` | A run was deliberately not performed |

## Deriving UI state

- **Banner**: `verify_start` / `gate_start` / `flow_start` → `RUNNING`.
  `flow_end.status === "passed"` (and no failures in the batch) → `GREEN`.
  Any failure → `RED`. `unverified` is its own state — never show it as green.
- **Loop counter**: increment on each `verify_start`.
- **The KANE → CLAUDE card**: render on `verify_result.status === "red"` and on
  `gate_result.status === "red"`, using `detail`. This is the closed-loop moment —
  it must be the most visually prominent thing on screen.
- **Evidence links**: `flow_end.run_dir` and `flow_end.test_url`.

## Agent channel

The orchestrator spawns `claude -p … --output-format stream-json --verbose` and
forwards each parsed line as `{channel:"agent", event}`. Loop events are sent as
`{channel:"kane", event}`. Useful `stream-json` types: `assistant` (text and
`tool_use` blocks), `user` (tool results), `result` (final), and — with
`--verbose` — `hook_started` / `hook_response`, which let the transcript show the
hook firing in real time.
