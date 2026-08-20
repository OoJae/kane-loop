import { useCallback, useEffect, useRef, useState } from 'react'
import { Pane } from './Pane'
import { TranscriptItemView } from './TranscriptItemView'
import type { TranscriptItem } from '../lib/store'

const STICK_THRESHOLD_PX = 90

interface TranscriptPaneProps {
  items: TranscriptItem[]
  busy: boolean
  /** True while Kane is red, so the pane frame echoes the alarm. */
  alert: boolean
}

/**
 * Middle pane — the agent's stream-json transcript, with Kane's injected
 * failures rendered inline exactly where the agent received them.
 */
export function TranscriptPane({ items, busy, alert }: TranscriptPaneProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [stuck, setStuck] = useState(true)
  const [unread, setUnread] = useState(0)
  const previousCount = useRef(items.length)

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = scrollRef.current
    if (!node) return
    requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior })
    })
  }, [])

  const handleScroll = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight
    const atBottom = distance < STICK_THRESHOLD_PX
    setStuck(atBottom)
    if (atBottom) setUnread(0)
  }, [])

  useEffect(() => {
    const added = items.length - previousCount.current
    previousCount.current = items.length
    if (added <= 0) return
    if (stuck) scrollToBottom()
    else setUnread((count) => count + added)
  }, [items.length, stuck, scrollToBottom])

  const jumpToLatest = useCallback(() => {
    setStuck(true)
    setUnread(0)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  return (
    <Pane
      step="02"
      title="Agent transcript"
      subtitle="claude · stream-json"
      tone={alert ? 'red' : 'neutral'}
      actions={
        <span
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-[0.12em] uppercase ${
            busy
              ? 'border-accent/45 bg-accent/10 text-accent'
              : 'border-line bg-panel-2 text-dim'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${busy ? 'animate-blink bg-accent' : 'bg-dim'}`}
            aria-hidden
          />
          {busy ? 'working' : 'idle'}
        </span>
      }
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="scroll-slim h-full overflow-y-auto px-4 py-4"
        >
          {items.length === 0 ? (
            <EmptyTranscript />
          ) : (
            <div className="flex flex-col gap-3 pb-2">
              {items.map((item) => (
                <TranscriptItemView key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>

        {!stuck && unread > 0 ? (
          <button
            type="button"
            onClick={jumpToLatest}
            className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full border border-accent/50 bg-accent px-4 py-2 text-[12.5px] font-bold text-ink shadow-[0_10px_30px_-8px_rgba(111,157,255,0.8)] transition-transform hover:-translate-y-0.5"
          >
            {unread} new {unread === 1 ? 'event' : 'events'} ↓
          </button>
        ) : null}
      </div>
    </Pane>
  )
}

function EmptyTranscript() {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div className="max-w-sm">
        <p className="font-mono text-[11px] font-bold tracking-[0.2em] text-dim uppercase">
          Waiting for the agent
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-mist">
          Type a feature request above and hit{' '}
          <span className="font-semibold text-ice">Run</span>. Claude&rsquo;s edits stream in
          here — and every time Kane goes red, the failure it found is injected right back
          into this conversation.
        </p>
        <div className="mt-5 rounded-xl border border-line-soft bg-panel-2/60 px-3 py-2.5 text-left">
          <p className="font-mono text-[10.5px] font-bold tracking-[0.14em] text-dim uppercase">
            try
          </p>
          <p className="mt-1 font-mono text-[12.5px] text-mist">
            the dark mode toggle loses its state on reload — fix it.
          </p>
        </div>
      </div>
    </div>
  )
}
