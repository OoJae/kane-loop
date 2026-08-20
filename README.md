# Kane Loop

**Watch an AI agent fix its own bug — with eyes.**

You type a feature request. Claude Code writes the code. The instant it saves a file, a
PostToolUse hook fires **Kane CLI** against the running app in a real local Chrome. When Kane
fails, the hook feeds the failure straight back into Claude's context, Claude reads it and edits
again, and the next save re-fires Kane. A Stop-hook gate won't let the agent say "done" while
Kane is red.

Kane isn't tacked on at the end. **The closed loop is the product.**

```
        you type a feature request
                    │
                    ▼
        ┌───────────────────────┐
        │  Claude Code (-p)     │  edits target-app/src/**
        └───────────┬───────────┘
                    │ save
                    ▼
        PostToolUse hook ──▶ kane-cli testmd run --agent --headless
                    │                     │
                    │                real Chrome, real assertions
                    │                     │
                    │         ┌───────────┴───────────┐
                    │      GREEN                     RED
                    │         │                       │
                    │         │        additionalContext ─┐
                    │         │                       │   │
                    ▼         ▼                       ▼   │
        Stop hook ──▶ re-runs Kane                 Claude reads the
        blocks "done" while red                    failure and edits ──┘
```

---

## Quickstart

```bash
git clone <this-repo> && cd kane-loop
./scripts/dev.sh          # target app :5173 · orchestrator :4000 · UI :4321
```

Open **http://localhost:4321**, type

> *the dark mode toggle loses its state on reload — fix it*

and watch the loop close: **RED → failure injected → agent self-corrects → GREEN → gate releases.**

**Requirements:** Node ≥ 18, Chrome, `jq`, Claude Code, and `kane-cli` authenticated
(`npm i -g @testmuai/kane-cli && kane-cli login`).

---

## What actually happens (no mocks anywhere)

The demo app ships with a genuine, deliberately seeded bug — the classic thing agents ship:
a dark-mode toggle held in React state with **no persistence**, so it resets on reload.

Kane catches it in a real browser. Measured, from the frozen flow in [`tests/darkmode_test.md`](tests/darkmode_test.md):

| | Exit code | Kane time | Steps |
|---|---|---|---|
| **RED** — bug present | `1` | 27 s | 3 passed, 1 failed |
| **GREEN** — after the fix | `0` | 26 s | 4 / 4 passed |

Raw NDJSON for both runs is in [`evidence/red/`](evidence/red/) and [`evidence/green/`](evidence/green/).
A full headless loop transcript is in [`evidence/loop-terminal/`](evidence/loop-terminal/).

This is the failure text the hook injects into the agent's context, verbatim:

```
KANE VERIFICATION FAILED after your last edit.

[darkmode_test.md] step "Verify dark mode survived" failed — failed assertion:
"the page background is dark" (Checkpoint assertion failed: "the page background is dark")

This is a real browser run against the running app, not a unit test. Read the failure
literally, fix the application code in target-app/src, and save — Kane re-runs
automatically on every save. Do NOT edit anything in tests/.
```

---

## The mechanism

Two hooks, wired in [`.claude/settings.json`](.claude/settings.json):

**[`kane-verify.sh`](.claude/hooks/kane-verify.sh) — PostToolUse.** Fires on `Edit|Write|MultiEdit`.
Scopes to `target-app/src/**` so editing a README never spawns Chrome. Takes an atomic
`mkdir` lock (matching hooks run in *parallel*, so `touch` would race). Runs every flow in
`tests/`, then returns Kane's failure as
`hookSpecificOutput.additionalContext` — capped at 4,000 chars, actionable reason first.

**[`kane-gate.sh`](.claude/hooks/kane-gate.sh) — Stop.** The spine. Re-runs the suite when the agent
tries to finish and blocks while anything is red. Guarded by `stop_hook_active` so it can never
loop forever, plus a max-4-blocks escape hatch that hands off for manual review rather than
fighting. It emits **both** documented block shapes *and* exits 2 — the gate is the one
mechanism that must never silently fail open.

Why both hooks? PostToolUse is the fast feedback and the visible moment. Stop is the
*guarantee*: even if a verify run is skipped (lock held, out of scope, timeout), the agent
still cannot finish on a broken app.

### Verified, not assumed

`additionalContext` delivery was proven by direct probe rather than taken on trust — see
[`docs/tool-surface.md`](docs/tool-surface.md), which also records four findings that
contradict the published docs and would silently break a naive implementation. The most
important: **a testmd run emits one `run_end` per step, not one per file**, so the widely-copied
`jq 'select(.type=="run_end")' | tail -1` reports only the last step and misses earlier failures.

---

## How this maps to the judging criteria

| Dimension | Where to look |
|---|---|
| **Ships** | `./scripts/dev.sh` → three panes live in under 30 s. Type a prompt, get a verified feature. |
| **Verified** | A real seeded bug caught by real Chrome: RED exit 1 → GREEN exit 0, same frozen cached flow. Raw NDJSON in `evidence/`. Nothing mocked, anywhere. |
| **Closed loop** | Hook fires Kane on save → failure injected as `additionalContext` → agent re-prompts itself → Stop gate blocks "done" until green. Both halves negative-tested. |
| **Craft** | Three-pane live viewer, one-command start, honest disclosures, and a commit history that narrates the build including the bugs we found in our own hooks. |

---

## Honesty notes

- **The bug is seeded on purpose and disclosed.** It is a real bug in real code, not a
  simulated failure — Kane genuinely fails against it and genuinely passes after the fix.
- **The agent cannot grade its own homework.** `tests/*_test.md` are read-only (`chmod 444`),
  app code and tests are separate directories, and [`target-app/CLAUDE.md`](target-app/CLAUDE.md)
  forbids touching tests. The agent is never told *how* to fix the bug — it derives that from
  Kane's failure.
- **The UI has an opt-in `?demo=1` mode** for rehearsing without burning credits. It paints an
  unmissable "DEMO DATA — NOT A REAL RUN" banner and can never be mistaken for a verdict.
- **An empty test suite reports `unverified`, never green.** We found that fail-open bug in our
  own gate during harness testing and fixed it.

## Pinned versions

Kane CLI **0.8.4** · Claude Code **2.1.238** · Node 26 · macOS + Chrome.
Ports: 5173 target app · 4000 orchestrator · 4321 UI.

## Repo map

| Path | What |
|---|---|
| [`.claude/hooks/`](.claude/hooks/) | the loop: `kane-verify.sh`, `kane-gate.sh`, shared `kane-lib.sh` |
| [`target-app/`](target-app/) | Kane Notes — the app the agent edits (seeded bug lives here) |
| [`tests/`](tests/) | frozen Kane flows — immutable ground truth |
| [`server/`](server/) | orchestrator: spawns the agent, tails the event log, serves evidence |
| [`web/`](web/) | the three-pane viewer |
| [`evidence/`](evidence/) | real red + green run artifacts |
| [`docs/tool-surface.md`](docs/tool-surface.md) | everything we verified about Kane + Claude Code |
| [`docs/event-protocol.md`](docs/event-protocol.md) | the hooks → server → UI contract |

---

*Self-healing tests keep tests green. Kane Loop keeps the product correct — it gives the agent
eyes and a spine.*
