import type { FormEvent, MutableRefObject } from 'react'
import { ConnectionBadge } from './ConnectionBadge'
import type { Connection } from '../lib/useSocket'

interface TopBarProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  /** POST /run is in flight — the button is genuinely blocked. */
  submitting: boolean
  /** The agent is mid-run; the button stays live so the server can answer 409. */
  agentBusy: boolean
  error: string | null
  onDismissError: () => void
  connection: Connection
  demo: boolean
  recorded?: boolean
  /** Focus lands here when the key bar unmounts, so nobody is stranded on body. */
  promptRef?: MutableRefObject<HTMLInputElement | null>
  /** A validated key is held in memory for this page. */
  keyArmed?: boolean
  /** Last four characters only — enough to tell one key from another. */
  keyHint?: string
  onClearKey?: () => void
}

export function TopBar({
  value,
  onChange,
  onSubmit,
  onStop,
  submitting,
  agentBusy,
  error,
  onDismissError,
  connection,
  demo,
  recorded = false,
  promptRef,
  keyArmed = false,
  keyHint = '',
  onClearKey,
}: TopBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <header className="shrink-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <div className="flex shrink-0 items-center gap-3">
          {/* The mark: a loop caught mid-close. The green arc runs at a tighter
              radius so its end tucks inside the red one's start — the ends pass
              rather than meet. No gradient between them: a verdict has no
              in-between, the way an exit code doesn't. Same geometry as
              site/public/brand/mark.svg. */}
          <span
            className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-panel shadow-[0_0_30px_-10px_rgba(52,227,155,0.6)]"
            aria-hidden
          >
            <svg viewBox="0 0 64 64" className="h-6 w-6">
              <g fill="none" strokeWidth="7" strokeLinecap="round">
                <path d="M 32 6 A 26 26 0 0 1 32 58" stroke="#ff3b52" />
                <path d="M 32 58 A 22 22 0 0 1 32 14" stroke="#34e39b" />
              </g>
            </svg>
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
              ref={promptRef}
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
          {agentBusy && !demo ? (
            <button
              type="button"
              onClick={onStop}
              title="Ask the orchestrator to stop the current run"
              className="h-12 shrink-0 rounded-xl border border-line bg-panel px-4 text-[14px] font-bold text-mist transition-colors hover:border-red/60 hover:text-red-soft"
            >
              Stop
            </button>
          ) : null}
        </form>

        {keyArmed ? (
          <div
            className="flex shrink-0 items-center gap-2 rounded-xl border border-line bg-panel-2 px-3 py-2"
            title="Run is enabled until you reload this page. The key is held in memory and never stored."
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mist" aria-hidden />
            <div className="leading-none">
              <p className="font-mono text-[10.5px] font-black tracking-[0.14em] text-mist uppercase">
                run enabled
              </p>
              <p className="mt-1 font-mono text-[10px] text-dim">
                key ····{keyHint}
              </p>
            </div>
            <button
              type="button"
              onClick={onClearKey}
              className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] font-bold text-dim uppercase transition-colors hover:border-dim hover:text-mist"
            >
              clear
            </button>
          </div>
        ) : null}

        <ConnectionBadge connection={connection} demo={demo} recorded={recorded} />
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
