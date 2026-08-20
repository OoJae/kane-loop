import { SERVER_URL } from '../lib/config'
import type { Connection } from '../lib/useSocket'

/** Visible connection health for the orchestrator socket, with a manual retry. */
export function ConnectionBadge({
  connection,
  demo,
}: {
  connection: Connection
  demo: boolean
}) {
  if (demo) {
    return (
      <div className="flex shrink-0 items-center gap-2 rounded-xl border border-amber/40 bg-amber/10 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-amber" aria-hidden />
        <span className="font-mono text-[11px] font-bold tracking-[0.14em] text-amber uppercase">
          socket off · demo
        </span>
      </div>
    )
  }

  const { state, retryIn, reconnectNow } = connection
  const label =
    state === 'open'
      ? 'live'
      : state === 'connecting'
        ? 'connecting'
        : state === 'reconnecting'
          ? retryIn > 0
            ? `reconnecting · ${retryIn}s`
            : 'reconnecting'
          : 'offline'

  const tone =
    state === 'open'
      ? 'border-green/40 bg-green/10 text-green'
      : state === 'connecting'
        ? 'border-accent/40 bg-accent/10 text-accent'
        : 'border-red/50 bg-red/10 text-red-soft'

  const dot =
    state === 'open' ? 'bg-green' : state === 'connecting' ? 'bg-accent animate-blink' : 'bg-red animate-blink'

  return (
    <div className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 ${tone}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
      <div className="leading-none">
        <span className="block font-mono text-[11px] font-bold tracking-[0.14em] uppercase">
          {label}
        </span>
        <span className="mt-0.5 block font-mono text-[10px] text-dim">
          {SERVER_URL.replace(/^https?:\/\//, '')}
        </span>
      </div>
      {state !== 'open' ? (
        <button
          type="button"
          onClick={reconnectNow}
          className="ml-1 rounded-md border border-current/40 px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase opacity-80 transition-opacity hover:opacity-100"
        >
          retry
        </button>
      ) : null}
    </div>
  )
}
