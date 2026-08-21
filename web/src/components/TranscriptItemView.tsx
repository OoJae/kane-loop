import { useState } from 'react'
import { clockTime, countLines, firstLine, truncate } from '../lib/format'
import type { TranscriptItem } from '../lib/store'
import { KaneInjectionCard } from './KaneInjectionCard'

const TOOL_ACCENT: Record<string, string> = {
  Edit: 'text-accent border-accent/40 bg-accent/10',
  Write: 'text-accent border-accent/40 bg-accent/10',
  MultiEdit: 'text-accent border-accent/40 bg-accent/10',
  NotebookEdit: 'text-accent border-accent/40 bg-accent/10',
  Bash: 'text-amber border-amber/40 bg-amber/10',
}

const NEUTRAL_TOOL = 'text-mist border-line bg-panel-2'

function Stamp({ ts }: { ts: number }) {
  return (
    <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">
      {clockTime(ts)}
    </span>
  )
}

function ToolResultRow({ item }: { item: Extract<TranscriptItem, { kind: 'tool_result' }> }) {
  const [open, setOpen] = useState(false)
  const lines = countLines(item.text)
  const preview = firstLine(item.text, 68) || '(empty)'

  return (
    <div className="pl-7">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors ${
          item.isError
            ? 'border-red/40 bg-red/8 hover:border-red/70'
            : 'border-line-soft bg-panel-2/60 hover:border-line'
        }`}
      >
        <span className="shrink-0 font-mono text-[10px] text-dim">{open ? '▾' : '▸'}</span>
        <span
          className={`shrink-0 font-mono text-[10.5px] font-bold tracking-[0.1em] uppercase ${
            item.isError ? 'text-red-soft' : 'text-dim'
          }`}
        >
          {item.isError ? 'error' : 'result'}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-mist">
          {preview}
        </span>
        <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">
          {lines} {lines === 1 ? 'line' : 'lines'}
        </span>
      </button>
      {open ? (
        <pre className="scroll-slim mt-1 max-h-64 overflow-auto rounded-lg border border-line-soft bg-ink-2 p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-mist">
          {truncate(item.text, 8000)}
        </pre>
      ) : null}
    </div>
  )
}

export function TranscriptItemView({ item }: { item: TranscriptItem }) {
  const enter = item.replay ? '' : 'animate-rise'

  switch (item.kind) {
    case 'injection':
      return (
        <KaneInjectionCard
          phase={item.phase}
          detail={item.detail}
          loop={item.loop}
          ts={item.ts}
          blocks={item.blocks}
          screenshot={item.screenshot}
          replay={item.replay}
        />
      )

    case 'prompt':
      return (
        <div className={`rounded-xl border border-accent/35 bg-accent/8 px-4 py-3 ${enter}`}>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.16em] text-accent uppercase">
              You
            </span>
            <span className="h-px flex-1 bg-accent/20" />
            <Stamp ts={item.ts} />
          </div>
          <p className="text-[15.5px] leading-snug font-semibold text-ice">{item.text}</p>
        </div>
      )

    case 'text':
      return (
        <div className={`border-l-2 border-line pl-3 ${enter}`}>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.16em] text-mist uppercase">
              Claude
            </span>
            <Stamp ts={item.ts} />
          </div>
          <p className="text-[14px] leading-[1.6] whitespace-pre-wrap text-ice">{item.text}</p>
        </div>
      )

    case 'thinking':
      return (
        <div className={`border-l-2 border-line-soft pl-3 ${enter}`}>
          <p className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-dim italic">
            {truncate(item.text, 600)}
          </p>
        </div>
      )

    case 'tool_use': {
      const accent = TOOL_ACCENT[item.name] ?? NEUTRAL_TOOL
      return (
        <div className={`flex items-center gap-2 ${enter}`}>
          <span
            className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[12px] font-bold ${accent}`}
          >
            {item.name}
          </span>
          {item.target ? (
            <>
              <span className="shrink-0 text-[12px] text-dim">→</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ice">
                {item.target}
              </code>
            </>
          ) : (
            <span className="flex-1" />
          )}
          <Stamp ts={item.ts} />
        </div>
      )
    }

    case 'tool_result':
      return <ToolResultRow item={item} />

    case 'hook':
      return (
        <div
          className={`flex items-center gap-2 rounded-lg border border-amber/30 bg-amber/8 px-2.5 py-1.5 ${enter}`}
        >
          <span className="shrink-0 text-[12px] text-amber" aria-hidden>
            ⚙
          </span>
          <span className="shrink-0 font-mono text-[11px] font-bold tracking-[0.1em] text-amber uppercase">
            {item.label}
          </span>
          {item.detail ? (
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-mist">
              {item.detail}
            </code>
          ) : (
            <span className="flex-1" />
          )}
          <Stamp ts={item.ts} />
        </div>
      )

    case 'result':
      return (
        <div
          className={`rounded-xl border px-4 py-3 ${enter} ${
            item.isError ? 'border-red/45 bg-red/8' : 'border-green/35 bg-green/8'
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <span
              className={`font-mono text-[10.5px] font-bold tracking-[0.16em] uppercase ${
                item.isError ? 'text-red-soft' : 'text-green'
              }`}
            >
              {item.isError ? 'Run failed' : 'Agent finished'}
            </span>
            <span className="h-px flex-1 bg-line" />
            <Stamp ts={item.ts} />
          </div>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ice">
            {truncate(item.text, 1200)}
          </p>
        </div>
      )

    case 'notice':
      return (
        <div className={`flex items-center gap-2 ${enter}`}>
          <span className="h-px flex-1 bg-line-soft" />
          <span className="text-center font-mono text-[11px] tracking-[0.08em] text-dim uppercase">
            {item.text}
          </span>
          <span className="h-px flex-1 bg-line-soft" />
        </div>
      )

    default:
      return null
  }
}
