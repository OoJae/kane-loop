/**
 * Types for the Kane Loop event protocol.
 *
 * Source of truth: docs/event-protocol.md. Everything the UI renders comes from
 * here — the orchestrator broadcasts two channels over one WebSocket:
 *
 *   { channel: "kane",  event }  — lines from .kane-events.ndjson
 *   { channel: "agent", event }  — parsed `claude --output-format stream-json` lines
 *
 * Kane channel lines come in two flavours: Kane's own NDJSON verbatim (no
 * `source` field) and Kane Loop control events (`source: "kane-loop"`).
 * Loop state is derived ONLY from `source === "kane-loop"`; raw Kane lines are
 * rendered as a receipts feed.
 */

export type KanePhase = 'verify' | 'gate'

/** `flow_end.status` — the only verdict in the protocol. */
export type FlowStatus = 'passed' | 'failed' | 'error'

/** `verify_result.status` / `gate_result.status`. */
export type LoopStatus = 'red' | 'green' | 'unverified'

interface LoopEventBase {
  source: 'kane-loop'
  type: string
  phase?: KanePhase
  ts?: string
}

export interface VerifyStartEvent extends LoopEventBase {
  type: 'verify_start'
  file?: string
}

export interface GateStartEvent extends LoopEventBase {
  type: 'gate_start'
}

export interface FlowStartEvent extends LoopEventBase {
  type: 'flow_start'
  flow?: string
}

export interface FlowEndEvent extends LoopEventBase {
  type: 'flow_end'
  flow?: string
  status?: FlowStatus
  summary?: string
  one_liner?: string
  reason?: string
  /** Seconds or milliseconds — normalised at render time. */
  duration?: number | string
  credits?: number
  run_dir?: string
  test_url?: string
}

export interface FlowErrorEvent extends LoopEventBase {
  type: 'flow_error'
  flow?: string
  reason?: string
}

export interface VerifyResultEvent extends LoopEventBase {
  type: 'verify_result'
  status?: LoopStatus
  detail?: string
}

export interface GateResultEvent extends LoopEventBase {
  type: 'gate_result'
  status?: Exclude<LoopStatus, 'unverified'>
  detail?: string
  blocks?: boolean
}

export interface GateReleaseEvent extends LoopEventBase {
  type: 'gate_release'
  reason?: string
  status?: LoopStatus
}

export interface SkippedEvent extends LoopEventBase {
  type: 'skipped'
  reason?: string
}

export type KaneLoopEvent =
  | VerifyStartEvent
  | GateStartEvent
  | FlowStartEvent
  | FlowEndEvent
  | FlowErrorEvent
  | VerifyResultEvent
  | GateResultEvent
  | GateReleaseEvent
  | SkippedEvent

/** Kane's own NDJSON, forwarded verbatim. Progress lines have no `type`. */
export interface RawKaneLine {
  type?: string
  [key: string]: unknown
}

export type KaneChannelEvent = KaneLoopEvent | RawKaneLine

export function isKaneLoopEvent(event: unknown): event is KaneLoopEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as { source?: unknown }).source === 'kane-loop' &&
    typeof (event as { type?: unknown }).type === 'string'
  )
}

/* ------------------------------------------------------------------ agent */

export interface ToolUseBlock {
  type: 'tool_use'
  id?: string
  name?: string
  input?: Record<string, unknown>
}

export interface TextBlock {
  type: 'text'
  text?: string
}

export interface ThinkingBlock {
  type: 'thinking'
  thinking?: string
}

export interface ToolResultBlock {
  type: 'tool_result'
  tool_use_id?: string
  is_error?: boolean
  content?: unknown
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | { type: string; [key: string]: unknown }

/** A parsed line of `claude -p --output-format stream-json --verbose`. */
export interface AgentEvent {
  type?: string
  subtype?: string
  message?: {
    id?: string
    role?: string
    content?: ContentBlock[] | string
  }
  /** hook_started / hook_response */
  hook_event_name?: string
  hook_name?: string
  command?: string
  /** result events */
  result?: string
  is_error?: boolean
  duration_ms?: number
  total_cost_usd?: number
  num_turns?: number
  [key: string]: unknown
}

/* --------------------------------------------------------------- envelope */

export type Channel = 'kane' | 'agent'

export interface ServerMessage {
  channel?: Channel | string
  event?: unknown
  /** Set on events replayed from history when a client connects. */
  replay?: boolean
  ts?: string
  [key: string]: unknown
}

export interface NormalisedMessage {
  channel: Channel
  event: KaneChannelEvent | AgentEvent
  replay: boolean
}

const AGENT_TYPES = new Set([
  'assistant',
  'user',
  'result',
  'system',
  'hook_started',
  'hook_response',
  'stream_event',
])

const LOOP_TYPES = new Set([
  'verify_start',
  'gate_start',
  'flow_start',
  'flow_end',
  'flow_error',
  'verify_result',
  'gate_result',
  'gate_release',
  'skipped',
])

/**
 * Accepts every envelope shape the orchestrator might plausibly emit:
 *   { channel, event }              — the documented shape
 *   { channel, ...event }           — the shape sketched in the build guide
 *   a bare event with no channel    — inferred from its own fields
 * Returns null for anything unrecognisable rather than throwing.
 */
export function normaliseMessage(raw: unknown): NormalisedMessage | null {
  if (typeof raw !== 'object' || raw === null) return null
  const message = raw as ServerMessage

  let event: unknown = message.event
  if (event === undefined) {
    const { channel: _channel, replay: _replay, ...rest } = message
    void _channel
    void _replay
    event = rest
  }
  if (typeof event !== 'object' || event === null) return null

  const replay =
    message.replay === true || (event as { replay?: unknown }).replay === true

  let channel = message.channel
  if (channel !== 'kane' && channel !== 'agent') {
    const type = (event as { type?: unknown }).type
    if (isKaneLoopEvent(event)) channel = 'kane'
    else if (typeof type === 'string' && LOOP_TYPES.has(type)) channel = 'kane'
    else if (typeof type === 'string' && AGENT_TYPES.has(type)) channel = 'agent'
    else channel = 'kane'
  }

  return {
    channel: channel as Channel,
    event: event as KaneChannelEvent | AgentEvent,
    replay,
  }
}
