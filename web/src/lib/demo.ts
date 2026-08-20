/**
 * DEMO MODE — opt in with `?demo=1`.
 *
 * A scripted replay of a full red -> green Kane Loop, built from the exact event
 * shapes in docs/event-protocol.md. It exists so the UI can be rehearsed (and
 * screenshotted) while the orchestrator or Kane is offline.
 *
 * It is deliberately impossible to mistake for a real run: the WebSocket is not
 * even opened in demo mode, and the whole app renders a persistent
 * "DEMO DATA — NOT A REAL RUN" banner plus a striped frame.
 */

import type { NormalisedMessage } from './protocol'

export interface DemoStep {
  /** Milliseconds to wait after the previous step. */
  after: number
  /** Human label shown in the demo control strip. */
  label: string
  message?: NormalisedMessage
  prompt?: string
}

/** A beat worth jumping to when rehearsing. `index` = steps played, exclusive. */
export interface DemoMark {
  label: string
  index: number
}

const kane = (event: Record<string, unknown>): NormalisedMessage => ({
  channel: 'kane',
  event: { source: 'kane-loop', ...event } as NormalisedMessage['event'],
  replay: false,
})

const agent = (event: Record<string, unknown>): NormalisedMessage => ({
  channel: 'agent',
  event: event as NormalisedMessage['event'],
  replay: false,
})

const assistantText = (text: string) =>
  agent({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  })

const toolUse = (id: string, name: string, input: Record<string, unknown>) =>
  agent({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  })

const toolResult = (id: string, content: string) =>
  agent({
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: id, content }],
    },
  })

const RED_DETAIL = `KANE VERIFICATION FAILED after your last edit.

[darkmode_test.md] Step 3 of 3 failed. After reloading http://localhost:5173 the page background was rgb(244, 245, 247) and the toggle read "off" — the dark theme did not survive the reload. Expected a dark background.

Read the failure, fix the application code in target-app/src (do NOT edit the tests), and save — Kane re-runs automatically.`

const GATE_DETAIL = `Kane is still failing: [darkmode_test.md] page is light after reload. You are not done. Keep fixing the app code until every Kane flow passes.`

export const DEMO_PROMPT =
  'the dark mode toggle loses its state on reload — fix it.'

export const DEMO_SCRIPT: DemoStep[] = [
  { after: 300, label: 'Prompt submitted', prompt: DEMO_PROMPT },
  {
    after: 700,
    label: 'Session start',
    message: agent({ type: 'system', subtype: 'init' }),
  },
  {
    after: 900,
    label: 'Claude reads the app',
    message: assistantText(
      "I'll look at how the theme is stored before changing anything.",
    ),
  },
  {
    after: 600,
    label: 'Read App.tsx',
    message: toolUse('t1', 'Read', { file_path: 'target-app/src/App.tsx' }),
  },
  {
    after: 700,
    label: 'Read result',
    message: toolResult(
      't1',
      "     1→import { useEffect, useState } from 'react'\n     2→\n    22→  const [isDark, setIsDark] = useState(false)\n    32→  useEffect(() => {\n    33→    document.body.dataset.theme = isDark ? 'dark' : 'light'\n    34→  }, [isDark])\n\n(143 lines total)",
    ),
  },
  {
    after: 900,
    label: 'Claude proposes a fix',
    message: assistantText(
      'The theme only lives in React state, so a reload resets it to `false`. I will read the initial value from localStorage and write it back on every change.',
    ),
  },
  {
    after: 800,
    label: 'Edit App.tsx',
    message: toolUse('t2', 'Edit', {
      file_path: 'target-app/src/App.tsx',
      old_string: 'useState(false)',
      new_string: "useState(() => localStorage.getItem('theme') === 'dark')",
    }),
  },
  {
    after: 400,
    label: 'PostToolUse hook fires',
    message: agent({
      type: 'hook_started',
      hook_event_name: 'PostToolUse',
      command: '.claude/hooks/kane-verify.sh',
    }),
  },
  {
    after: 300,
    label: 'verify_start (loop #1)',
    message: kane({
      type: 'verify_start',
      phase: 'verify',
      file: 'target-app/src/App.tsx',
    }),
  },
  {
    after: 600,
    label: 'flow_start darkmode_test.md',
    message: kane({ type: 'flow_start', phase: 'verify', flow: 'darkmode_test.md' }),
  },
  {
    after: 3600,
    label: 'flow_end FAILED',
    message: kane({
      type: 'flow_end',
      phase: 'verify',
      flow: 'darkmode_test.md',
      status: 'failed',
      summary:
        'Opened the app, toggled dark mode, reloaded — the page rendered light again.',
      one_liner: 'Page background is light after reload',
      reason:
        'After reload the computed background of <body> was rgb(244, 245, 247); expected a dark background. The toggle state was not persisted.',
      duration: 34.2,
      credits: 3,
      run_dir: 'evidence/red/run-20260821-101455-darkmode',
      test_url: 'https://app.testmuai.com/runs/demo-red-run',
    }),
  },
  {
    after: 700,
    label: 'verify_result RED → injected',
    message: kane({
      type: 'verify_result',
      phase: 'verify',
      status: 'red',
      detail: RED_DETAIL,
    }),
  },
  {
    after: 400,
    label: 'hook_response',
    message: agent({ type: 'hook_response', hook_event_name: 'PostToolUse' }),
  },
  {
    after: 1400,
    label: 'Claude reacts to Kane',
    message: assistantText(
      'Kane saw the page render light after the reload, so my edit did not persist the choice. I will initialise from localStorage *and* write to it inside the effect.',
    ),
  },
  {
    after: 900,
    label: 'Edit App.tsx again',
    message: toolUse('t3', 'Edit', {
      file_path: 'target-app/src/App.tsx',
      old_string: "document.body.dataset.theme = isDark ? 'dark' : 'light'",
      new_string:
        "document.body.dataset.theme = isDark ? 'dark' : 'light'\n    localStorage.setItem('theme', isDark ? 'dark' : 'light')",
    }),
  },
  {
    after: 400,
    label: 'PostToolUse hook fires',
    message: agent({
      type: 'hook_started',
      hook_event_name: 'PostToolUse',
      command: '.claude/hooks/kane-verify.sh',
    }),
  },
  {
    after: 300,
    label: 'verify_start (loop #2)',
    message: kane({
      type: 'verify_start',
      phase: 'verify',
      file: 'target-app/src/App.tsx',
    }),
  },
  {
    after: 600,
    label: 'flow_start darkmode_test.md',
    message: kane({ type: 'flow_start', phase: 'verify', flow: 'darkmode_test.md' }),
  },
  {
    after: 3200,
    label: 'flow_end PASSED',
    message: kane({
      type: 'flow_end',
      phase: 'verify',
      flow: 'darkmode_test.md',
      status: 'passed',
      summary:
        'Opened the app, toggled dark mode, reloaded — the page stayed dark.',
      one_liner: 'Dark background persisted across the reload',
      reason: 'Body background was rgb(10, 11, 13) after reload, as expected.',
      duration: 21.8,
      credits: 1,
      run_dir: 'evidence/green/run-20260821-101702-darkmode',
      test_url: 'https://app.testmuai.com/runs/demo-green-run',
    }),
  },
  {
    after: 600,
    label: 'verify_result GREEN',
    message: kane({
      type: 'verify_result',
      phase: 'verify',
      status: 'green',
      detail: 'All Kane flows passed after the last save.',
    }),
  },
  {
    after: 900,
    label: 'Agent tries to stop → gate',
    message: kane({ type: 'gate_start', phase: 'gate' }),
  },
  {
    after: 2200,
    label: 'gate flow_end PASSED',
    message: kane({
      type: 'flow_end',
      phase: 'gate',
      flow: 'darkmode_test.md',
      status: 'passed',
      summary: 'Gate re-run: dark mode still persists.',
      one_liner: 'Gate re-run confirmed the fix',
      reason: 'Cached replay, no regression.',
      duration: 8.4,
      credits: 0,
      run_dir: 'evidence/green/run-20260821-101744-gate',
      test_url: 'https://app.testmuai.com/runs/demo-gate-run',
    }),
  },
  {
    after: 500,
    label: 'gate_release',
    message: kane({
      type: 'gate_release',
      phase: 'gate',
      status: 'green',
      reason: 'every Kane flow passed',
    }),
  },
  {
    after: 700,
    label: 'Agent finishes',
    message: agent({
      type: 'result',
      subtype: 'success',
      result:
        'Dark mode now persists across reloads: the initial state reads from localStorage and every toggle writes back to it. Kane re-ran and passed.',
      duration_ms: 68400,
      num_turns: 6,
    }),
  },
]

/** Indices worth jumping to when rehearsing — used by the demo control strip. */
export const DEMO_MARKS: DemoMark[] = [
  { label: 'Start', index: 0 },
  { label: 'RED', index: 12 },
  { label: 'GREEN', index: 20 },
  { label: 'Released', index: DEMO_SCRIPT.length },
]

/**
 * Second script (`?demo=gate`): the Stop-gate beat. The agent declares itself
 * done while Kane is still red, and the gate blocks it.
 */
export const GATE_DEMO_SCRIPT: DemoStep[] = [
  { after: 300, label: 'Prompt submitted', prompt: DEMO_PROMPT },
  {
    after: 700,
    label: 'Claude edits',
    message: assistantText(
      'I will read the saved theme when the component mounts.',
    ),
  },
  {
    after: 600,
    label: 'Edit App.tsx',
    message: toolUse('g1', 'Edit', {
      file_path: 'target-app/src/App.tsx',
      old_string: 'useState(false)',
      new_string: "useState(() => localStorage.getItem('theme') === 'dark')",
    }),
  },
  {
    after: 400,
    label: 'PostToolUse hook fires',
    message: agent({
      type: 'hook_started',
      hook_event_name: 'PostToolUse',
      command: '.claude/hooks/kane-verify.sh',
    }),
  },
  {
    after: 300,
    label: 'verify_start (loop #1)',
    message: kane({ type: 'verify_start', phase: 'verify', file: 'target-app/src/App.tsx' }),
  },
  {
    after: 500,
    label: 'flow_start',
    message: kane({ type: 'flow_start', phase: 'verify', flow: 'darkmode_test.md' }),
  },
  {
    after: 3000,
    label: 'flow_end FAILED',
    message: kane({
      type: 'flow_end',
      phase: 'verify',
      flow: 'darkmode_test.md',
      status: 'failed',
      summary: 'Toggled dark mode, reloaded — the page came back light.',
      one_liner: 'Page background is light after reload',
      reason: 'Nothing was ever written to localStorage, so the read finds nothing.',
      duration: 31.7,
      credits: 3,
      run_dir: 'evidence/red/run-20260821-104012-darkmode',
      test_url: 'https://app.testmuai.com/runs/demo-gate-red',
    }),
  },
  {
    after: 600,
    label: 'verify_result RED',
    message: kane({
      type: 'verify_result',
      phase: 'verify',
      status: 'red',
      detail: RED_DETAIL,
    }),
  },
  {
    after: 1500,
    label: 'Agent declares it is done',
    message: assistantText(
      "That should be it — dark mode now initialises from localStorage. I'm done here.",
    ),
  },
  {
    after: 500,
    label: 'Stop hook fires',
    message: agent({
      type: 'hook_started',
      hook_event_name: 'Stop',
      command: '.claude/hooks/kane-gate.sh',
    }),
  },
  { after: 300, label: 'gate_start', message: kane({ type: 'gate_start', phase: 'gate' }) },
  {
    after: 2600,
    label: 'gate flow_end FAILED',
    message: kane({
      type: 'flow_end',
      phase: 'gate',
      flow: 'darkmode_test.md',
      status: 'failed',
      summary: 'Gate re-run: still light after reload.',
      one_liner: 'Gate re-run still fails',
      reason: 'Body background was rgb(244, 245, 247) after reload.',
      duration: 24.9,
      credits: 1,
      run_dir: 'evidence/red/run-20260821-104121-gate',
      test_url: 'https://app.testmuai.com/runs/demo-gate-block',
    }),
  },
  {
    after: 600,
    label: 'gate_result RED → BLOCKED',
    message: kane({
      type: 'gate_result',
      phase: 'gate',
      status: 'red',
      blocks: true,
      detail: GATE_DETAIL,
    }),
  },
  {
    after: 1600,
    label: 'Claude goes back to work',
    message: assistantText(
      'The gate is right — I read from localStorage but never wrote to it. Adding the write.',
    ),
  },
  {
    after: 800,
    label: 'Edit App.tsx again',
    message: toolUse('g2', 'Edit', {
      file_path: 'target-app/src/App.tsx',
      old_string: "document.body.dataset.theme = isDark ? 'dark' : 'light'",
      new_string:
        "document.body.dataset.theme = isDark ? 'dark' : 'light'\n    localStorage.setItem('theme', isDark ? 'dark' : 'light')",
    }),
  },
  {
    after: 400,
    label: 'PostToolUse hook fires',
    message: agent({
      type: 'hook_started',
      hook_event_name: 'PostToolUse',
      command: '.claude/hooks/kane-verify.sh',
    }),
  },
  {
    after: 300,
    label: 'verify_start (loop #2)',
    message: kane({ type: 'verify_start', phase: 'verify', file: 'target-app/src/App.tsx' }),
  },
  {
    after: 500,
    label: 'flow_start',
    message: kane({ type: 'flow_start', phase: 'verify', flow: 'darkmode_test.md' }),
  },
  {
    after: 2800,
    label: 'flow_end PASSED',
    message: kane({
      type: 'flow_end',
      phase: 'verify',
      flow: 'darkmode_test.md',
      status: 'passed',
      summary: 'Toggled dark mode, reloaded — still dark.',
      one_liner: 'Dark background persisted across the reload',
      reason: 'Body background was rgb(10, 11, 13) after reload, as expected.',
      duration: 20.3,
      credits: 1,
      run_dir: 'evidence/green/run-20260821-104402-darkmode',
      test_url: 'https://app.testmuai.com/runs/demo-gate-green',
    }),
  },
  {
    after: 600,
    label: 'verify_result GREEN',
    message: kane({
      type: 'verify_result',
      phase: 'verify',
      status: 'green',
      detail: 'All Kane flows passed after the last save.',
    }),
  },
  { after: 800, label: 'gate_start', message: kane({ type: 'gate_start', phase: 'gate' }) },
  {
    after: 2000,
    label: 'gate flow_end PASSED',
    message: kane({
      type: 'flow_end',
      phase: 'gate',
      flow: 'darkmode_test.md',
      status: 'passed',
      summary: 'Gate re-run: dark mode still persists.',
      one_liner: 'Gate re-run confirmed the fix',
      reason: 'Cached replay, no regression.',
      duration: 7.9,
      credits: 0,
      run_dir: 'evidence/green/run-20260821-104438-gate',
      test_url: 'https://app.testmuai.com/runs/demo-gate-release',
    }),
  },
  {
    after: 500,
    label: 'gate_release',
    message: kane({
      type: 'gate_release',
      phase: 'gate',
      status: 'green',
      reason: 'every Kane flow passed',
    }),
  },
  {
    after: 700,
    label: 'Agent finishes',
    message: agent({
      type: 'result',
      subtype: 'success',
      result:
        'Dark mode persists across reloads. The Stop gate re-ran Kane and released the session.',
      duration_ms: 74100,
      num_turns: 8,
    }),
  },
]

export const GATE_DEMO_MARKS: DemoMark[] = [
  { label: 'Start', index: 0 },
  { label: 'RED', index: 8 },
  { label: 'Blocked', index: 13 },
  { label: 'GREEN', index: 20 },
  { label: 'Released', index: GATE_DEMO_SCRIPT.length },
]

export interface DemoScript {
  name: string
  steps: DemoStep[]
  marks: DemoMark[]
}

const SCRIPTS: Record<string, DemoScript> = {
  loop: { name: 'red → green loop', steps: DEMO_SCRIPT, marks: DEMO_MARKS },
  gate: { name: 'stop gate blocks “done”', steps: GATE_DEMO_SCRIPT, marks: GATE_DEMO_MARKS },
}

/** `?demo=1` → the loop script; `?demo=gate` → the Stop-gate script. */
export function getDemoScript(param: string | null): DemoScript {
  if (param && SCRIPTS[param]) return SCRIPTS[param]
  return SCRIPTS.loop
}
