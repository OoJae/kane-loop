import { clockTime } from '../lib/format'
import type { KanePhase } from '../lib/protocol'

interface KaneInjectionCardProps {
  phase: KanePhase
  detail: string
  loop: number
  ts: number
  blocks: boolean
  /** Replayed history renders identically but without the entrance animation. */
  replay: boolean
}

/**
 * THE closed-loop moment. Kane failed, and its reason is being written straight
 * back into the coding agent's context. Everything about this card is tuned to
 * be the first thing an eye lands on in a 1080p video frame.
 */
export function KaneInjectionCard({
  phase,
  detail,
  loop,
  ts,
  blocks,
  replay,
}: KaneInjectionCardProps) {
  const isGate = phase === 'gate'
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border-2 border-red bg-gradient-to-b from-red/18 via-panel to-panel ${
        replay ? '' : 'animate-slam'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-2xl ${replay ? '' : 'animate-alarm'}`}
        aria-hidden
      />

      <header className="relative flex flex-wrap items-center gap-x-3 gap-y-1 bg-red px-4 py-2.5">
        <h3 className="text-[26px] leading-none font-black tracking-[-0.02em] text-[#180205] uppercase">
          Kane <span className="mx-0.5 align-[0.02em]">→</span> Claude
        </h3>
        <span className="rounded-md bg-[#180205]/25 px-2 py-1 font-mono text-[11px] font-bold tracking-[0.12em] text-[#2a0308] uppercase">
          {isGate ? 'Stop gate · blocked' : `Verify · loop #${loop}`}
        </span>
        <span className="ml-auto font-mono text-[11px] font-bold tracking-wider text-[#2a0308]/80 tabular-nums">
          {clockTime(ts)}
        </span>
      </header>

      <p className="relative border-b border-red/30 bg-red/10 px-4 py-2 text-[12.5px] leading-snug font-bold tracking-[0.06em] text-red-soft uppercase">
        {isGate
          ? 'The agent tried to finish. The gate sent it back to work.'
          : 'Kane failed. The failure is being injected into the agent’s context.'}
      </p>

      <div className="relative px-4 py-3.5">
        <pre className="max-h-72 overflow-auto border-l-2 border-red/70 pl-3 font-mono text-[13.5px] leading-[1.55] whitespace-pre-wrap text-ice scroll-slim">
          {detail}
        </pre>
      </div>

      <footer className="relative flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-red/25 bg-[#1a070a]/60 px-4 py-2.5 text-[11.5px] leading-snug text-red-soft">
        <span className="font-bold tracking-[0.1em] uppercase">
          {isGate ? 'decision: block' : 'additionalContext'}
        </span>
        <span className="text-dim">·</span>
        <span className="text-mist">
          {isGate
            ? `returned by .claude/hooks/kane-gate.sh — Claude cannot say “done” while Kane is red${
                blocks ? '' : ' (advisory)'
              }`
            : 'written by .claude/hooks/kane-verify.sh — Claude reads this and edits the code'}
        </span>
      </footer>
    </article>
  )
}
