import type { FormEvent } from 'react'
import { ConnectionBadge } from './ConnectionBadge'
import type { Connection } from '../lib/useSocket'

interface TopBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** POST /run is in flight — the button is genuinely blocked. */
  submitting: boolean
  /** The agent is mid-run; the button stays live so the server can answer 409. */
  agentBusy: boolean
  error: string | null
  onDismissError: () => void
  connection: Connection
  demo: boolean
}

export function TopBar({
  value,
  onChange,
  onSubmit,
  submitting,
  agentBusy,
  error,
  onDismissError,
  connection,
  demo,
}: TopBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <header className="shrink-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex shrink-0 items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel text-[20px] shadow-[0_0_30px_-10px_rgba(52,227,155,0.6)]"
            aria-hidden
          >
            <span className="bg-gradient-to-br from-red to-green bg-clip-text text-transparent">
              ↻
            </span>
          </span>
          <div className="leading-none">
            <h1 className="text-[22px] leading-none font-black tracking-[-0.03em] text-ice">
              KANE&nbsp;LOOP
            </h1>
            <p className="mt-1.5 text-[11.5px] leading-none font-medium tracking-[0.06em] text-dim">
              the agent writes it · Kane proves it · the failure goes back in
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder="add / fix a feature…"
              aria-label="Feature request for the coding agent"
              spellCheck={false}
              autoComplete="off"
              className="h-12 w-full rounded-xl border border-line bg-panel pr-16 pl-4 text-[15.5px] font-medium text-ice placeholder:text-dim focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] font-bold text-dim">
              ⏎
            </span>
          </div>
          <button
            type="submit"
            disabled={submitting || value.trim().length === 0}
            className={`h-12 shrink-0 rounded-xl px-7 text-[15px] font-black tracking-tight transition-all active:translate-y-px disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-dim ${
              agentBusy && !submitting
                ? 'bg-accent/70 text-ink hover:brightness-110'
                : 'bg-accent text-ink hover:brightness-110'
            }`}
          >
            {submitting ? 'Sending…' : agentBusy ? 'Running…' : 'Run'}
          </button>
        </form>

        <ConnectionBadge connection={connection} demo={demo} />
      </div>

      {error ? (
        <div
          role="alert"
          className="mt-2 flex items-center gap-2 rounded-xl border border-red/50 bg-red/10 px-3 py-2"
        >
          <span className="font-mono text-[10.5px] font-black tracking-[0.14em] text-red uppercase">
            error
          </span>
          <span className="min-w-0 flex-1 text-[13px] text-red-soft">{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            className="shrink-0 rounded border border-red/40 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-soft uppercase transition-colors hover:bg-red/20"
          >
            dismiss
          </button>
        </div>
      ) : null}
    </header>
  )
}
