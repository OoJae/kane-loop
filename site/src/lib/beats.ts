/**
 * The beats of the loop.
 *
 * Every assertion, duration and credit figure below is lifted from
 * evidence/ui/live-loop.events.ndjson — a committed recording of a real run.
 * Nothing here is written for effect. If the recording changes, these change.
 *
 *   flow_end  failed  23s  2.0848 cr  "the page background is still dark"
 *   flow_end  passed  12s  0 cr       (cached replay)
 *   flow_end  passed  11s  0 cr       (gate re-check)
 *   total                  2.0848 cr  (82s wall clock, first event to gate)
 */
export type Phase = 'idle' | 'edit' | 'verify' | 'fail' | 'inject' | 'fix' | 'pass' | 'gate'

export interface Beat {
  phase: Phase
  /** Left rail: what the loop is doing. */
  label: string
  /** What the viewer should understand at this moment. */
  line: string
  /** Is the app pane dark? */
  dark: boolean
  reloading?: boolean
  /** Verdict shown on the right rail, if any. */
  verdict?: 'RED' | 'GREEN'
  /** Mono detail — machine output only. */
  data?: string
}

export const BEATS: Beat[] = [
  {
    phase: 'idle',
    label: 'loop #1 · idle',
    line: 'The app works. Toggle dark mode and it goes dark.',
    dark: false,
    data: 'kane-cli 0.8.4 · claude 2.1.238',
  },
  {
    phase: 'edit',
    label: 'loop #1 · toggled',
    line: 'Dark mode is on. The agent would call this done.',
    dark: true,
    data: 'Edit → target-app/src/App.tsx',
  },
  {
    phase: 'verify',
    label: 'loop #1 · reloading',
    line: 'Kane reloads the page in a real Chrome. This is the part an agent skips.',
    dark: true,
    reloading: true,
    data: 'kane-cli testmd run --agent --headless',
  },
  {
    phase: 'fail',
    label: 'loop #1 · verdict',
    line: 'Light again. The toggle never persisted — the bug, caught by a browser.',
    dark: false,
    verdict: 'RED',
    data: 'exit 1 · 23s · 2.0848 credits · 3 of 4 steps passed',
  },
  {
    phase: 'inject',
    label: 'loop #1 · injected',
    line: 'The failure goes back into the agent’s context. Nobody typed anything.',
    dark: false,
    verdict: 'RED',
    data: '"the page background is still dark" (assertion_failed: @ step 2)',
  },
  {
    phase: 'fix',
    label: 'loop #2 · editing',
    line: '“I added the read side but not the write. Adding persistence now…”',
    dark: false,
    data: 'Edit → target-app/src/App.tsx',
  },
  {
    phase: 'pass',
    label: 'loop #2 · verdict',
    line: 'Reloaded, and it held. Same browser, same assertion, different answer.',
    dark: true,
    verdict: 'GREEN',
    data: 'exit 0 · 12s · 0 credits (cached replay)',
  },
  {
    phase: 'gate',
    label: 'stop gate · released',
    line: 'Only now may the agent say it is done.',
    dark: true,
    verdict: 'GREEN',
    data: 'gate released — every flow passes, oracle intact',
  },
]
