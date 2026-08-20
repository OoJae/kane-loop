import type { ReactNode } from 'react'

export type PaneTone = 'neutral' | 'accent' | 'red' | 'green' | 'amber'

const RING: Record<PaneTone, string> = {
  neutral: 'border-line',
  accent: 'border-accent/45',
  red: 'border-red/60',
  green: 'border-green/50',
  amber: 'border-amber/50',
}

const NUMBER: Record<PaneTone, string> = {
  neutral: 'bg-panel-2 text-dim border-line',
  accent: 'bg-accent/12 text-accent border-accent/40',
  red: 'bg-red/15 text-red-soft border-red/50',
  green: 'bg-green/12 text-green border-green/40',
  amber: 'bg-amber/12 text-amber border-amber/40',
}

interface PaneProps {
  step: string
  title: string
  subtitle?: string
  tone?: PaneTone
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** One of the three columns: a titled, bordered panel with a scrollable body. */
export function Pane({
  step,
  title,
  subtitle,
  tone = 'neutral',
  actions,
  children,
  className = '',
}: PaneProps) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-panel/80 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] backdrop-blur-sm transition-colors duration-300 ${RING[tone]} ${className}`}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-line-soft bg-ink-2/70 px-4 py-3">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border font-mono text-[12px] font-bold tabular-nums ${NUMBER[tone]}`}
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] leading-tight font-semibold tracking-tight text-ice">
            {title}
          </h2>
          {subtitle ? (
            <p className="truncate text-[11px] leading-tight font-medium tracking-[0.14em] text-dim uppercase">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}
