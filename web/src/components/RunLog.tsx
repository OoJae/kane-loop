import { useCallback, useEffect, useRef, useState } from 'react'
import { clockTime, formatDuration, truncate } from '../lib/format'
import type { LogEntry, LogTone, Receipt } from '../lib/store'

const DOT: Record<LogTone, string> = {
  neutral: 'bg-dim',
  accent: 'bg-accent',
  red: 'bg-red',
  green: 'bg-green',
  amber: 'bg-amber',
}

const TEXT: Record<LogTone, string> = {
  neutral: 'text-mist',
  accent: 'text-accent',
  red: 'text-red-soft',
  green: 'text-green',
  amber: 'text-amber',
}

type Tab = 'log' | 'receipts'

/** Scrolling history of loop events, plus Kane's raw NDJSON as a receipts feed. */
export function RunLog({ log, receipts }: { log: LogEntry[]; receipts: Receipt[] }) {
  const [tab, setTab] = useState<Tab>('log')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stuck = useRef(true)
  const count = tab === 'log' ? log.length : receipts.length

  const handleScroll = useCallback(() => {
    const node = scrollRef.current
    if (!node) return
    stuck.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node || !stuck.current) return
    requestAnimationFrame(() => {
      node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' })
    })
  }, [count, tab])

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="mb-1.5 flex shrink-0 items-center gap-1">
        <TabButton active={tab === 'log'} onClick={() => setTab('log')}>
          Run log
        </TabButton>
        <TabButton active={tab === 'receipts'} onClick={() => setTab('receipts')}>
          Kane receipts
          {receipts.length > 0 ? (
            <span className="ml-1 font-mono tabular-nums opacity-70">{receipts.length}</span>
          ) : null}
        </TabButton>
        <span className="h-px flex-1 bg-line-soft" />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scroll-slim min-h-0 flex-1 overflow-y-auto rounded-xl border border-line-soft bg-ink-2/60 p-1.5"
      >
        {tab === 'log' ? (
          log.length === 0 ? (
            <Empty text="Loop events land here the moment a save fires the hook." />
          ) : (
            <ul className="flex flex-col">
              {log.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-panel-2/60"
                >
                  <span className="shrink-0 pt-[3px] font-mono text-[10.5px] text-dim tabular-nums">
                    {clockTime(entry.ts)}
                  </span>
                  <span
                    className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${DOT[entry.tone]}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[12.5px] leading-snug font-semibold ${TEXT[entry.tone]}`}
                    >
                      {entry.label}
                    </span>
                    {entry.detail ? (
                      <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-dim">
                        {truncate(entry.detail.replace(/\s+/g, ' '), 120)}
                      </span>
                    ) : null}
                  </span>
                  {entry.durationMs !== undefined ? (
                    <span className="shrink-0 pt-[3px] font-mono text-[10.5px] text-dim tabular-nums">
                      {formatDuration(entry.durationMs)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : receipts.length === 0 ? (
          <Empty text="Kane's own NDJSON, verbatim. Nothing yet." />
        ) : (
          <ul className="flex flex-col">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="flex items-center gap-2 px-1.5 py-1">
                <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">
                  {clockTime(receipt.ts)}
                </span>
                <span className="shrink-0 rounded border border-line px-1 py-0.5 font-mono text-[9.5px] font-bold tracking-wider text-mist uppercase">
                  {receipt.type}
                </span>
                <code
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-dim"
                  title={truncate(receipt.text, 2000)}
                >
                  {receipt.text}
                </code>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 font-mono text-[10.5px] font-bold tracking-[0.14em] uppercase transition-colors ${
        active
          ? 'bg-panel-2 text-ice'
          : 'text-dim hover:bg-panel-2/60 hover:text-mist'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-2 py-3 text-[12px] text-dim">{text}</p>
}
