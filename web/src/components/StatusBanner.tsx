import { formatDuration } from '../lib/format'
import type { BannerStatus } from '../lib/store'
import type { KanePhase } from '../lib/protocol'

interface StatusBannerProps {
  status: BannerStatus
  loop: number
  phase: KanePhase | null
  elapsedMs: number | null
  lastRunMs: number | null
  greenFlash: number
  redFlash: number
}

const WORD: Record<BannerStatus, string> = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  RED: 'RED',
  GREEN: 'GREEN',
  UNVERIFIED: 'UNVERIFIED',
}

const SIZE: Record<BannerStatus, string> = {
  IDLE: 'text-[54px] xl:text-[66px]',
  RUNNING: 'text-[50px] xl:text-[62px]',
  RED: 'text-[86px] leading-[0.85] xl:text-[108px]',
  GREEN: 'text-[74px] leading-[0.85] xl:text-[94px]',
  UNVERIFIED: 'text-[34px] xl:text-[42px]',
}

const SHELL: Record<BannerStatus, string> = {
  IDLE: 'border-line bg-panel-2/60',
  RUNNING: 'border-accent/50 bg-accent/8',
  RED: 'border-red bg-gradient-to-b from-red/22 to-panel animate-alarm',
  GREEN: 'border-green bg-gradient-to-b from-green/18 to-panel animate-thrum',
  UNVERIFIED: 'border-amber/60 bg-amber/8',
}

const INK: Record<BannerStatus, string> = {
  IDLE: 'text-dim',
  RUNNING: 'text-accent',
  RED: 'text-red',
  GREEN: 'text-green',
  UNVERIFIED: 'text-amber',
}

const GLOW: Record<BannerStatus, string> = {
  IDLE: '',
  RUNNING: 'drop-shadow-[0_0_26px_rgba(111,157,255,0.45)]',
  RED: 'drop-shadow-[0_0_40px_rgba(255,59,82,0.65)]',
  GREEN: 'drop-shadow-[0_0_40px_rgba(52,227,155,0.6)]',
  UNVERIFIED: 'drop-shadow-[0_0_24px_rgba(255,176,32,0.4)]',
}

function caption(status: BannerStatus): string {
  switch (status) {
    case 'IDLE':
      return 'No Kane run yet'
    case 'RUNNING':
      return 'Kane is driving a real browser'
    case 'RED':
      return 'Kane caught it — the agent has been told'
    case 'GREEN':
      return 'Proven in a real browser'
    case 'UNVERIFIED':
      return 'No verdict — this is NOT a pass'
  }
}

/** Right pane hero: the state of the loop, readable from across the room. */
export function StatusBanner({
  status,
  loop,
  phase,
  elapsedMs,
  lastRunMs,
  greenFlash,
  redFlash,
}: StatusBannerProps) {
  const running = status === 'RUNNING'

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 px-4 pt-3 pb-4 transition-colors duration-300 ${SHELL[status]}`}
    >
      {greenFlash > 0 ? (
        <span
          key={`g${greenFlash}`}
          className="animate-sweep pointer-events-none absolute inset-0 bg-green/45"
          aria-hidden
        />
      ) : null}
      {redFlash > 0 ? (
        <span
          key={`r${redFlash}`}
          className="animate-sweep pointer-events-none absolute inset-0 bg-red/40"
          aria-hidden
        />
      ) : null}

      <div className="relative flex items-center gap-2">
        <span className="font-mono text-[10.5px] font-bold tracking-[0.2em] text-dim uppercase">
          Kane verdict
        </span>
        <span className="h-px flex-1 bg-line" />
        {phase ? (
          <span className="rounded-md border border-line bg-panel-2 px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-[0.12em] text-mist uppercase">
            {phase === 'gate' ? 'stop gate' : 'post-save'}
          </span>
        ) : null}
      </div>

      <p
        className={`relative mt-2 font-black tracking-[-0.045em] tabular-nums ${SIZE[status]} ${INK[status]} ${GLOW[status]}`}
        role="status"
        aria-live="polite"
      >
        {WORD[status]}
      </p>

      {running ? (
        <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-full bg-accent/15">
          <span className="animate-scan absolute inset-y-0 left-0 w-1/3 rounded-full bg-accent/80" />
        </div>
      ) : null}

      <div className="relative mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={`text-[13.5px] leading-snug font-semibold ${INK[status]}`}>
          {caption(status)}
        </p>
        <span className="ml-auto font-mono text-[12px] text-dim tabular-nums">
          {running && elapsedMs !== null
            ? `${formatDuration(elapsedMs)} elapsed`
            : lastRunMs !== null && lastRunMs > 250
              ? `last run ${formatDuration(lastRunMs)}`
              : ''}
        </span>
      </div>

      <div className="relative mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
        <span className="font-mono text-[10.5px] font-bold tracking-[0.16em] text-dim uppercase">
          Loop
        </span>
        <span className="font-mono text-[30px] leading-none font-black text-ice tabular-nums">
          #{loop}
        </span>
        <span className="text-[11.5px] leading-tight text-dim">
          verify runs
          <br />
          this session
        </span>
      </div>
    </div>
  )
}
