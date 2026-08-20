import { Pane, type PaneTone } from './Pane'
import { StatusBanner } from './StatusBanner'
import { FlowVerdicts } from './FlowVerdicts'
import { EvidenceStrip } from './EvidenceStrip'
import { RunLog } from './RunLog'
import type { AppState, BannerStatus } from '../lib/store'

const TONE: Record<BannerStatus, PaneTone> = {
  IDLE: 'neutral',
  RUNNING: 'accent',
  RED: 'red',
  GREEN: 'green',
  UNVERIFIED: 'amber',
}

interface VerifierPaneProps {
  state: AppState
  elapsedMs: number | null
}

/** Right pane — everything Kane has to say, at video-legible size. */
export function VerifierPane({ state, elapsedMs }: VerifierPaneProps) {
  return (
    <Pane
      step="03"
      title="Kane verifier"
      subtitle="real browser · real verdict"
      tone={TONE[state.status]}
      actions={
        <span className="rounded-full border border-line bg-panel-2 px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-[0.12em] text-dim uppercase">
          kane-cli
        </span>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        <StatusBanner
          status={state.status}
          loop={state.loop}
          phase={state.phase}
          elapsedMs={elapsedMs}
          lastRunMs={state.lastRunMs}
          greenFlash={state.greenFlash}
          redFlash={state.redFlash}
        />
        <FlowVerdicts flows={state.flows} />
        <EvidenceStrip evidence={state.evidence} creditsTotal={state.creditsTotal} />
        <RunLog log={state.log} receipts={state.receipts} />
      </div>
    </Pane>
  )
}
