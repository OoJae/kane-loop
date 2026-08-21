import { formatCredits, formatDuration } from '../lib/format'
import type { FlowVerdict } from '../lib/store'

const PILL: Record<FlowVerdict['status'], string> = {
  passed: 'border-green/50 bg-green/15 text-green',
  failed: 'border-red/60 bg-red/15 text-red-soft',
  error: 'border-amber/50 bg-amber/15 text-amber',
  timeout: 'border-amber/50 bg-amber/15 text-amber',
}

const EDGE: Record<FlowVerdict['status'], string> = {
  passed: 'border-l-green',
  failed: 'border-l-red',
  error: 'border-l-amber',
  timeout: 'border-l-amber',
}

/**
 * Per-flow verdicts for the current batch. `flow_end` is the only verdict in
 * the protocol, so this list is the literal ground truth behind the banner.
 */
export function FlowVerdicts({ flows }: { flows: FlowVerdict[] }) {
  return (
    <section className="shrink-0">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="font-mono text-[10.5px] font-bold tracking-[0.18em] text-dim uppercase">
          Flow verdicts
        </h3>
        <span className="h-px flex-1 bg-line-soft" />
        <span className="font-mono text-[10.5px] text-dim tabular-nums">
          {flows.length} {flows.length === 1 ? 'flow' : 'flows'}
        </span>
      </div>

      {flows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-soft px-3 py-2.5 text-[12px] text-dim">
          No <code className="font-mono text-mist">flow_end</code> yet. Only a{' '}
          <code className="font-mono text-mist">flow_end</code> counts as a verdict.
        </p>
      ) : (
        <ul className="scroll-slim flex max-h-52 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {flows.map((flow) => (
            <li
              key={flow.id}
              className={`rounded-r-lg border border-line-soft border-l-[3px] bg-panel-2/70 px-2.5 py-2 ${EDGE[flow.status]}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] font-black tracking-[0.1em] uppercase ${PILL[flow.status]}`}
                >
                  {flow.status}
                </span>
                <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-ice">
                  {flow.flow}
                </code>
                {flow.reasonCode ? (
                  <span
                    className="shrink-0 rounded border border-line px-1 py-0.5 font-mono text-[9.5px] tracking-wider text-dim uppercase"
                    title="Kane reason_code"
                  >
                    {flow.reasonCode}
                  </span>
                ) : null}
                <span className="shrink-0 font-mono text-[10.5px] text-dim tabular-nums">
                  {formatDuration(flow.durationMs)}
                  {flow.credits !== undefined ? ` · ${formatCredits(flow.credits)} cr` : ''}
                </span>
              </div>
              {flow.oneLiner ? (
                <p className="mt-1 text-[12.5px] leading-snug font-semibold text-ice">
                  {flow.oneLiner}
                </p>
              ) : null}
              {flow.reason && flow.reason !== flow.oneLiner ? (
                <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-mist">
                  {flow.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
