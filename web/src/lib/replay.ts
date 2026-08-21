/**
 * Replay of a REAL recorded session.
 *
 * This is the deployable half of Kane Loop. The loop itself cannot run on static
 * hosting — it spawns the `claude` CLI, drives a real Chrome through `kane-cli`,
 * writes files and holds a WebSocket — so what a hosted page can honestly offer
 * is a playback of a session that genuinely happened.
 *
 * The distinction from `demo.ts` matters and is the whole point: demo mode is
 * hand-authored illustration, this is bytes committed in the repo. Nothing here
 * is written by hand; every line comes from a file a reader can diff against
 * GitHub. That is a falsifiable claim, which is the only kind worth making on a
 * page whose thesis is "nothing is mocked".
 *
 * Two channels are merged into one timeline:
 *   <name>.events.ndjson  — the Kane channel, written by the hooks
 *   <name>.stream.json    — the agent channel, `claude --output-format stream-json`
 * The orchestrator broadcasts agent events but never persists them, so the
 * second file only exists when a run was captured with `tee`. A recording
 * without it still replays; the transcript pane is simply quieter.
 */
import type { DemoMark, DemoScript, DemoStep } from './demo'
import { normaliseMessage } from './protocol'

export interface Recording {
  /** URL-safe id used in `?replay=<id>`. */
  id: string
  /** Shown in the banner. */
  title: string
  /** One line on what the viewer is watching. */
  blurb: string
  /** Repo-relative path of the Kane-channel log, for the "view the raw log" link. */
  sourcePath: string
  eventsUrl: string
  streamUrl?: string
}

export const RECORDINGS: Recording[] = [
  {
    id: 'live-loop',
    title: 'The loop closing — red → green',
    blurb:
      'A prompt, two failing Kane runs in a real browser, the agent reading each failure and ' +
      'correcting itself, then green and the Stop gate releasing.',
    sourcePath: 'evidence/ui/live-loop.events.ndjson',
    eventsUrl: 'recordings/live-loop.events.ndjson',
    streamUrl: 'recordings/live-loop.stream.json',
  },
  {
    id: 'gate-blocks',
    title: 'The Stop gate refusing "done" four times',
    blurb:
      'The agent is told not to change any code. It tries to finish; the gate re-runs Kane and ' +
      'blocks — four times — before the escape hatch hands off for manual review.',
    sourcePath: 'evidence/loop-terminal/gate-blocks-repeatedly.events.ndjson',
    eventsUrl: 'recordings/gate-blocks.events.ndjson',
    streamUrl: 'recordings/gate-blocks.stream.json',
  },
]

export const DEFAULT_RECORDING = RECORDINGS[0] as Recording

export function findRecording(id: string | null): Recording | undefined {
  if (id === null || id === '' || id === '1' || id === 'true') return DEFAULT_RECORDING
  return RECORDINGS.find((r) => r.id === id)
}

interface TimedLine {
  at: number
  seq: number
  raw: unknown
}

/** Both channels timestamp differently: `ts` on Kane events, `timestamp` on agent lines. */
function timeOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  for (const key of ['ts', 'timestamp']) {
    const candidate = record[key]
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return null
}

/**
 * Only a minority of lines carry a clock: in a real capture 24 of 181 Kane lines
 * and 20 of 27 agent lines had one. Dropping the rest threw away 75% of the
 * recording, so undated lines inherit the last timestamp seen in their own file
 * — they are already in chronological order within it — and any leading
 * undated lines are backfilled from the first real one.
 */
function parseLines(text: string, seqBase: number): TimedLine[] {
  const out: TimedLine[] = []
  let last: number | null = null
  let seq = seqBase
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    let raw: unknown
    try {
      raw = JSON.parse(trimmed)
    } catch {
      // A truncated final line is normal in an append-only log. Skip it.
      continue
    }
    const stamped = timeOf(raw)
    if (stamped !== null) last = stamped
    out.push({ at: last ?? Number.NaN, seq: seq++, raw })
  }
  const firstKnown = out.find((l) => !Number.isNaN(l.at))?.at ?? 0
  for (const line of out) {
    if (Number.isNaN(line.at)) line.at = firstKnown
  }
  return out
}

/** Longest gap we will actually sit through, so a 3-minute run plays in ~40s. */
const MAX_GAP_MS = 1400
/** Floor, so a burst of same-millisecond events still reads as motion. */
const MIN_GAP_MS = 90

function labelOf(raw: unknown): string {
  const record = raw as Record<string, unknown>
  const type = typeof record['type'] === 'string' ? (record['type'] as string) : 'event'
  const status = typeof record['status'] === 'string' ? ` · ${record['status'] as string}` : ''
  return `${type}${status}`
}

/**
 * Merge both channels by wall clock and convert to the step shape `useDemo`
 * already drives. Real inter-event gaps are preserved in proportion but clamped,
 * because the honest duration of these runs is around three minutes.
 */
export function toSteps(eventsText: string, streamText: string | null): DemoStep[] {
  // seqBase keeps each file's own order intact, and breaks ties between the two
  // channels deterministically instead of by whatever sort() happens to do.
  const lines = [...parseLines(eventsText, 0), ...parseLines(streamText ?? '', 1_000_000)].sort(
    (a, b) => a.at - b.at || a.seq - b.seq,
  )
  if (lines.length === 0) return []

  const steps: DemoStep[] = []
  let previous = lines[0]?.at ?? 0
  for (const line of lines) {
    const gap = Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, line.at - previous))
    previous = line.at
    const message = normaliseMessage(line.raw)
    if (message === null) continue
    steps.push({ after: gap, label: labelOf(line.raw), message })
  }
  return steps
}

/** Chapter marks derived from the real verdicts, so the scrubber is meaningful. */
function marksOf(steps: DemoStep[]): DemoMark[] {
  const marks: DemoMark[] = [{ label: 'Start', index: 0 }]
  steps.forEach((step, index) => {
    const label = step.label
    if (label.startsWith('verify_result · red') || label.startsWith('gate_result · red')) {
      if (!marks.some((m) => m.label === 'RED')) marks.push({ label: 'RED', index })
    }
    if (label.startsWith('verify_result · green')) {
      if (!marks.some((m) => m.label === 'GREEN')) marks.push({ label: 'GREEN', index })
    }
    if (label.startsWith('gate_result') || label.startsWith('gate_release')) {
      const existing = marks.findIndex((m) => m.label === 'Gate')
      if (existing === -1) marks.push({ label: 'Gate', index })
    }
  })
  return marks
}

export async function loadRecording(recording: Recording): Promise<DemoScript> {
  const base = import.meta.env.BASE_URL || '/'
  const eventsRes = await fetch(`${base}${recording.eventsUrl}`)
  if (!eventsRes.ok) throw new Error(`Could not load ${recording.eventsUrl}`)
  const eventsText = await eventsRes.text()

  let streamText: string | null = null
  if (recording.streamUrl !== undefined) {
    const streamRes = await fetch(`${base}${recording.streamUrl}`)
    if (streamRes.ok) streamText = await streamRes.text()
  }
  const steps = toSteps(eventsText, streamText)
  return { name: recording.title, steps, marks: marksOf(steps) }
}
