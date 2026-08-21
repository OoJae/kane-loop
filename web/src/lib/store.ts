/**
 * The single reducer that turns protocol events into UI state.
 *
 * Every state transition documented in docs/event-protocol.md §"Deriving UI
 * state" lives here and nowhere else, so demo mode and the live WebSocket feed
 * are guaranteed to behave identically.
 */

import {
  isKaneLoopEvent,
  type AgentEvent,
  type ContentBlock,
  type FlowEndEvent,
  type FlowStatus,
  type KaneLoopEvent,
  type KanePhase,
  type NormalisedMessage,
  type RawKaneLine,
  type ToolResultBlock,
  type ToolUseBlock,
} from './protocol'
import { describeTool, present, textOf, toBool, toMillis } from './format'

export type BannerStatus = 'IDLE' | 'RUNNING' | 'RED' | 'GREEN' | 'UNVERIFIED'

export type LogTone = 'neutral' | 'accent' | 'red' | 'green' | 'amber'

export interface LogEntry {
  id: number
  ts: number
  label: string
  detail?: string
  tone: LogTone
  phase?: KanePhase
  loop?: number
  durationMs?: number
  replay: boolean
}

export interface FlowVerdict {
  id: number
  flow: string
  status: FlowStatus
  oneLiner?: string
  reason?: string
  summary?: string
  /** e.g. "assertion_failed" — Kane's machine-readable failure class. */
  reasonCode?: string
  durationMs?: number
  credits?: number
  runDir?: string
  testUrl?: string
  ts: number
  loop: number
  phase?: KanePhase
}

export interface Evidence {
  runDir?: string
  testUrl?: string
  flow?: string
  ts: number
}

export interface Receipt {
  id: number
  ts: number
  type: string
  text: string
}

export type TranscriptItem =
  | { kind: 'prompt'; id: number; ts: number; replay: boolean; text: string }
  | { kind: 'text'; id: number; ts: number; replay: boolean; text: string }
  | { kind: 'thinking'; id: number; ts: number; replay: boolean; text: string }
  | {
      kind: 'tool_use'
      id: number
      ts: number
      replay: boolean
      name: string
      target: string
      input: Record<string, unknown>
      toolUseId?: string
    }
  | {
      kind: 'tool_result'
      id: number
      ts: number
      replay: boolean
      text: string
      isError: boolean
      toolUseId?: string
    }
  | {
      kind: 'hook'
      id: number
      ts: number
      replay: boolean
      label: string
      detail?: string
      done: boolean
    }
  | {
      kind: 'result'
      id: number
      ts: number
      replay: boolean
      text: string
      isError: boolean
      durationMs?: number
      costUsd?: number
    }
  | { kind: 'notice'; id: number; ts: number; replay: boolean; text: string }
  /** The closed-loop moment: Kane's failure injected back into the agent. */
  | {
      kind: 'injection'
      id: number
      ts: number
      replay: boolean
      phase: KanePhase
      detail: string
      loop: number
      blocks: boolean
    }

export interface AppState {
  status: BannerStatus
  /** Last status that was not RUNNING — used to detect a RED -> GREEN flip. */
  settledStatus: BannerStatus
  loop: number
  phase: KanePhase | null
  batchHasFailure: boolean
  runningSince: number | null
  lastRunMs: number | null
  log: LogEntry[]
  flows: FlowVerdict[]
  evidence: Evidence | null
  creditsTotal: number
  transcript: TranscriptItem[]
  receipts: Receipt[]
  /** Bumped on a RED -> GREEN flip so the view can fire a one-shot animation. */
  greenFlash: number
  /** Bumped whenever a fresh failure lands. */
  redFlash: number
  agentBusy: boolean
  lastEventAt: number | null
  seq: number
}

export const initialState: AppState = {
  status: 'IDLE',
  settledStatus: 'IDLE',
  loop: 0,
  phase: null,
  batchHasFailure: false,
  runningSince: null,
  lastRunMs: null,
  log: [],
  flows: [],
  evidence: null,
  creditsTotal: 0,
  transcript: [],
  receipts: [],
  greenFlash: 0,
  redFlash: 0,
  agentBusy: false,
  lastEventAt: null,
  seq: 0,
}

export type Action =
  | { kind: 'message'; message: NormalisedMessage; at: number }
  | { kind: 'prompt'; text: string; at: number }
  | { kind: 'notice'; text: string; at: number }
  | { kind: 'reset' }

const MAX_LOG = 400
const MAX_TRANSCRIPT = 600
const MAX_RECEIPTS = 250

function cap<T>(items: T[], max: number): T[] {
  return items.length > max ? items.slice(items.length - max) : items
}

/** Mutable draft helpers keep the reducer readable without a dependency. */
interface Draft extends AppState {}

function nextId(draft: Draft): number {
  draft.seq += 1
  return draft.seq
}

function pushLog(draft: Draft, entry: Omit<LogEntry, 'id'>): void {
  draft.log = cap([...draft.log, { ...entry, id: nextId(draft) }], MAX_LOG)
}

function pushTranscript(draft: Draft, item: TranscriptItem): void {
  draft.transcript = cap([...draft.transcript, item], MAX_TRANSCRIPT)
}

/**
 * Central status transition. `unverified` is deliberately its own terminal
 * state — it must never be rendered as green.
 */
function setStatus(draft: Draft, next: BannerStatus, at: number): void {
  if (next === 'RUNNING') {
    if (draft.status !== 'RUNNING') draft.runningSince = at
    draft.status = 'RUNNING'
    return
  }
  const cameFromRed = draft.settledStatus === 'RED' || draft.status === 'RED'
  if (draft.runningSince !== null) {
    draft.lastRunMs = Math.max(0, at - draft.runningSince)
    draft.runningSince = null
  }
  if (next === 'GREEN' && cameFromRed && draft.status !== 'GREEN') {
    draft.greenFlash += 1
  }
  if (next === 'RED' && draft.status !== 'RED') {
    draft.redFlash += 1
  }
  draft.status = next
  draft.settledStatus = next
}

function startBatch(draft: Draft, phase: KanePhase, at: number): void {
  draft.phase = phase
  draft.batchHasFailure = false
  draft.flows = []
  setStatus(draft, 'RUNNING', at)
}

/* ------------------------------------------------------------ kane channel */

function applyLoopEvent(
  draft: Draft,
  event: KaneLoopEvent,
  at: number,
  replay: boolean,
): void {
  const ts = Date.parse(event.ts ?? '') || at
  const phase: KanePhase =
    event.phase ?? (event.type.startsWith('gate') ? 'gate' : 'verify')

  switch (event.type) {
    case 'verify_start': {
      draft.loop += 1
      startBatch(draft, 'verify', at)
      pushLog(draft, {
        ts,
        label: `Loop #${draft.loop} · verify run started`,
        detail: event.file ? `save → ${event.file}` : undefined,
        tone: 'accent',
        phase: 'verify',
        loop: draft.loop,
        replay,
      })
      break
    }

    case 'gate_start': {
      startBatch(draft, 'gate', at)
      pushLog(draft, {
        ts,
        label: 'Stop gate re-checking',
        detail: 'the agent tried to finish',
        tone: 'accent',
        phase: 'gate',
        loop: draft.loop,
        replay,
      })
      break
    }

    case 'flow_start': {
      setStatus(draft, 'RUNNING', at)
      draft.phase = phase
      pushLog(draft, {
        ts,
        label: `Flow started`,
        detail: event.flow,
        tone: 'neutral',
        phase,
        loop: draft.loop,
        replay,
      })
      break
    }

    case 'flow_end': {
      applyFlowEnd(draft, event, ts, phase, replay, at)
      break
    }

    case 'flow_error': {
      draft.batchHasFailure = true
      draft.flows = [
        ...draft.flows,
        {
          id: nextId(draft),
          flow: event.flow ?? 'unknown flow',
          status: 'error',
          reason:
            present(event.reason) ?? 'Kane produced no run_end (auth/infra failure)',
          ts,
          loop: draft.loop,
          phase,
        },
      ]
      pushLog(draft, {
        ts,
        label: 'Flow error',
        detail: `${event.flow ?? 'flow'} — ${event.reason ?? 'no run_end produced'}`,
        tone: 'red',
        phase,
        loop: draft.loop,
        replay,
      })
      setStatus(draft, 'RED', at)
      break
    }

    case 'verify_result': {
      const status = event.status ?? 'unverified'
      pushLog(draft, {
        ts,
        label: `Verify result · ${status.toUpperCase()}`,
        detail: event.detail,
        tone: status === 'green' ? 'green' : status === 'red' ? 'red' : 'amber',
        phase: 'verify',
        loop: draft.loop,
        durationMs: draft.runningSince ? at - draft.runningSince : undefined,
        replay,
      })
      if (status === 'red') {
        setStatus(draft, 'RED', at)
        pushTranscript(draft, {
          kind: 'injection',
          id: nextId(draft),
          ts,
          replay,
          phase: 'verify',
          detail:
            present(event.detail) ??
            'Kane reported a failure but sent no detail. Check the run log and evidence.',
          loop: draft.loop,
          blocks: false,
        })
      } else if (status === 'green') {
        setStatus(draft, 'GREEN', at)
      } else {
        setStatus(draft, 'UNVERIFIED', at)
      }
      break
    }

    case 'gate_result': {
      const status = event.status ?? 'red'
      pushLog(draft, {
        ts,
        label: `Gate result · ${status.toUpperCase()}`,
        detail: event.detail,
        tone: status === 'green' ? 'green' : 'red',
        phase: 'gate',
        loop: draft.loop,
        replay,
      })
      // Only an explicit green is green. The gate also emits `tampered`, and
      // testing `=== 'red'` here treated that as success — a 94px GREEN banner
      // reading "Proven in a real browser" at the exact moment the gate caught
      // the oracle being altered. Anything that is not a pass blocks.
      if (status === 'green') {
        setStatus(draft, 'GREEN', at)
      } else {
        setStatus(draft, 'RED', at)
        pushTranscript(draft, {
          kind: 'injection',
          id: nextId(draft),
          ts,
          replay,
          phase: 'gate',
          detail:
            present(event.detail) ??
            (status === 'tampered'
              ? 'The Stop gate blocked completion: the test oracle changed during this session.'
              : 'The Stop gate blocked completion: Kane is red.'),
          loop: draft.loop,
          blocks: toBool(event.blocks, true),
        })
      }
      break
    }

    case 'gate_release': {
      // A release without a status is an escape hatch (e.g. `stop_hook_active`),
      // NOT a pass — never colour it green while the last verdict was red.
      const releaseTone: LogTone =
        event.status === 'green'
          ? 'green'
          : event.status === 'red' || draft.status === 'RED'
            ? 'amber'
            : 'green'
      pushLog(draft, {
        ts,
        label: 'Gate released',
        detail: event.reason,
        tone: releaseTone,
        phase: 'gate',
        loop: draft.loop,
        replay,
      })
      if (event.status === 'green') setStatus(draft, 'GREEN', at)
      else if (event.status === 'red') setStatus(draft, 'RED', at)
      else if (event.status === 'unverified') setStatus(draft, 'UNVERIFIED', at)
      else if (draft.status === 'RUNNING') setStatus(draft, draft.settledStatus, at)
      pushTranscript(draft, {
        kind: 'notice',
        id: nextId(draft),
        ts,
        replay,
        text: `Stop gate released the agent — ${event.reason ?? 'all Kane flows passed'}`,
      })
      break
    }

    case 'skipped': {
      pushLog(draft, {
        ts,
        label: 'Run skipped',
        detail: event.reason,
        tone: 'amber',
        phase,
        loop: draft.loop,
        replay,
      })
      // A skip is not a verdict: fall back to the last settled state.
      if (draft.status === 'RUNNING') setStatus(draft, draft.settledStatus, at)
      break
    }

    default:
      break
  }
}

function applyFlowEnd(
  draft: Draft,
  event: FlowEndEvent,
  ts: number,
  phase: KanePhase,
  replay: boolean,
  at: number,
): void {
  const status: FlowStatus = event.status ?? 'error'
  const durationMs = toMillis(event.duration)
  // Kane sends "" for fields it has nothing for; those must not overwrite
  // evidence captured by an earlier flow in the same session.
  const runDir = present(event.run_dir) ?? present(event.session_dir)
  const testUrl = present(event.test_url)
  const verdict: FlowVerdict = {
    id: nextId(draft),
    flow: event.flow ?? 'unknown flow',
    status,
    oneLiner: present(event.one_liner),
    reason: present(event.reason),
    summary: present(event.summary),
    reasonCode: present(event.reason_code),
    durationMs,
    credits: typeof event.credits === 'number' ? event.credits : undefined,
    runDir,
    testUrl,
    ts,
    loop: draft.loop,
    phase,
  }
  draft.flows = [...draft.flows.filter((f) => f.flow !== verdict.flow), verdict]
  if (typeof event.credits === 'number') draft.creditsTotal += event.credits
  if (runDir || testUrl) {
    draft.evidence = {
      runDir: runDir ?? draft.evidence?.runDir,
      testUrl: testUrl ?? draft.evidence?.testUrl,
      flow: verdict.flow,
      ts,
    }
  }

  const passed = status === 'passed'
  pushLog(draft, {
    ts,
    label: `Flow ${passed ? 'passed' : status === 'failed' ? 'failed' : 'errored'}`,
    detail: `${verdict.flow}${verdict.oneLiner ? ` — ${verdict.oneLiner}` : ''}`,
    tone: passed ? 'green' : 'red',
    phase,
    loop: draft.loop,
    durationMs,
    replay,
  })

  if (!passed) {
    // A failure is final for the batch, so surface it the moment it lands.
    draft.batchHasFailure = true
    setStatus(draft, 'RED', at)
  }
  // A PASSING flow deliberately does NOT set GREEN. With more than one flow in
  // tests/, the first flow can pass seconds before a later one fails — which
  // used to flip the banner to GREEN and fire the full-screen victory sweep
  // immediately before the suite went red. Only verify_result / gate_result,
  // which see the whole batch, may declare green. Per-flow pills still turn
  // green instantly, so nothing is hidden.
}

function applyRawKaneLine(
  draft: Draft,
  event: RawKaneLine,
  at: number,
): void {
  const type = typeof event.type === 'string' ? event.type : 'progress'
  let text: string
  try {
    text = JSON.stringify(event)
  } catch {
    text = String(event)
  }
  draft.receipts = cap(
    [...draft.receipts, { id: nextId(draft), ts: at, type, text }],
    MAX_RECEIPTS,
  )
}

/* ----------------------------------------------------------- agent channel */

function applyAgentEvent(
  draft: Draft,
  event: AgentEvent,
  at: number,
  replay: boolean,
): void {
  const type = event.type ?? ''
  const subtype = typeof event.subtype === 'string' ? event.subtype : ''

  if (type === 'assistant') {
    draft.agentBusy = true
    for (const block of blocksOf(event)) {
      pushAssistantBlock(draft, block, at, replay)
    }
    return
  }

  if (type === 'user') {
    for (const block of blocksOf(event)) {
      if (isToolResult(block)) {
        const text = textOf(block.content)
        pushTranscript(draft, {
          kind: 'tool_result',
          id: nextId(draft),
          ts: at,
          replay,
          text,
          isError: block.is_error === true,
          toolUseId: block.tool_use_id,
        })
      }
    }
    return
  }

  if (type === 'result') {
    draft.agentBusy = false
    pushTranscript(draft, {
      kind: 'result',
      id: nextId(draft),
      ts: at,
      replay,
      text:
        typeof event.result === 'string' && event.result.trim()
          ? event.result
          : subtype || 'Run finished.',
      isError: event.is_error === true || subtype.startsWith('error'),
      durationMs:
        typeof event.duration_ms === 'number' ? event.duration_ms : undefined,
      costUsd:
        typeof event.total_cost_usd === 'number' ? event.total_cost_usd : undefined,
    })
    return
  }

  if (type === 'hook_started' || subtype === 'hook_started') {
    draft.agentBusy = true
    pushTranscript(draft, {
      kind: 'hook',
      id: nextId(draft),
      ts: at,
      replay,
      label: hookLabel(event),
      detail: typeof event.command === 'string' ? event.command : undefined,
      done: false,
    })
    return
  }

  if (type === 'hook_response' || subtype === 'hook_response') {
    pushTranscript(draft, {
      kind: 'hook',
      id: nextId(draft),
      ts: at,
      replay,
      label: `${hookLabel(event)} returned`,
      detail: undefined,
      done: true,
    })
    return
  }

  if (type === 'system' && subtype === 'init') {
    draft.agentBusy = true
    pushTranscript(draft, {
      kind: 'notice',
      id: nextId(draft),
      ts: at,
      replay,
      text: 'Claude Code session started in target-app/',
    })
  }
}

function blocksOf(event: AgentEvent): ContentBlock[] {
  const content = event.message?.content
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (Array.isArray(content)) return content
  return []
}

function isToolUse(block: ContentBlock): block is ToolUseBlock {
  return block.type === 'tool_use'
}

function isToolResult(block: ContentBlock): block is ToolResultBlock {
  return block.type === 'tool_result'
}

function pushAssistantBlock(
  draft: Draft,
  block: ContentBlock,
  at: number,
  replay: boolean,
): void {
  if (block.type === 'text') {
    const text = String((block as { text?: unknown }).text ?? '').trim()
    if (!text) return
    pushTranscript(draft, {
      kind: 'text',
      id: nextId(draft),
      ts: at,
      replay,
      text,
    })
    return
  }
  if (block.type === 'thinking') {
    const text = String((block as { thinking?: unknown }).thinking ?? '').trim()
    if (!text) return
    pushTranscript(draft, {
      kind: 'thinking',
      id: nextId(draft),
      ts: at,
      replay,
      text,
    })
    return
  }
  if (isToolUse(block)) {
    const name = block.name ?? 'tool'
    const input = (block.input ?? {}) as Record<string, unknown>
    pushTranscript(draft, {
      kind: 'tool_use',
      id: nextId(draft),
      ts: at,
      replay,
      name,
      target: describeTool(name, input),
      input,
      toolUseId: block.id,
    })
  }
}

function hookLabel(event: AgentEvent): string {
  const name =
    (typeof event.hook_event_name === 'string' && event.hook_event_name) ||
    (typeof event.hook_name === 'string' && event.hook_name) ||
    'Hook'
  return `${name} hook`
}

/* ---------------------------------------------------------------- reducer */

export function reducer(state: AppState, action: Action): AppState {
  if (action.kind === 'reset') {
    return { ...initialState }
  }

  const draft: Draft = { ...state }

  if (action.kind === 'prompt') {
    pushTranscript(draft, {
      kind: 'prompt',
      id: nextId(draft),
      ts: action.at,
      replay: false,
      text: action.text,
    })
    draft.agentBusy = true
    draft.lastEventAt = action.at
    return draft
  }

  if (action.kind === 'notice') {
    pushTranscript(draft, {
      kind: 'notice',
      id: nextId(draft),
      ts: action.at,
      replay: false,
      text: action.text,
    })
    return draft
  }

  const { channel, event, replay } = action.message
  draft.lastEventAt = action.at

  if (channel === 'kane') {
    if (isKaneLoopEvent(event)) {
      applyLoopEvent(draft, event, action.at, replay)
    } else {
      applyRawKaneLine(draft, event as RawKaneLine, action.at)
    }
  } else {
    applyAgentEvent(draft, event as AgentEvent, action.at, replay)
  }

  return draft
}
