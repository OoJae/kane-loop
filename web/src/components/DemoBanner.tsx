import type { DemoControls } from '../lib/useDemo'

/**
 * Loud, permanent, impossible-to-miss labelling for demo mode. Demo mode never
 * touches the network: nothing on screen while this bar is up came from Kane.
 */
export function DemoBanner({ controls }: { controls: DemoControls }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-xl border-2 border-amber/70 bg-amber/10">
      <div className="demo-stripes h-1.5 w-full" aria-hidden />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <span className="rounded-md bg-amber px-2 py-1 text-[12px] font-black tracking-[0.1em] text-[#1a1204] uppercase">
          Demo data — not a real run
        </span>
        <span className="text-[12px] leading-snug text-amber/90">
          Scripted protocol events replayed locally (
          <span className="font-semibold">{controls.script.name}</span>). No Kane run, no
          orchestrator, no WebSocket — nothing here is a verification.
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-amber/80 tabular-nums">
            {controls.index}/{controls.total}
          </span>
          <Ctl onClick={controls.restart} title="Replay from the top">
            ⏮ Restart
          </Ctl>
          {controls.playing ? (
            <Ctl onClick={controls.pause} title="Pause on this beat">
              ⏸ Pause
            </Ctl>
          ) : (
            <Ctl
              onClick={controls.play}
              title="Resume"
              disabled={controls.finished}
            >
              ▶ Play
            </Ctl>
          )}
          <Ctl onClick={controls.step} title="Advance one event" disabled={controls.finished}>
            ⏭ Step
          </Ctl>
          <span className="mx-1 h-4 w-px bg-amber/40" aria-hidden />
          {controls.script.marks.map((mark) => (
            <Ctl
              key={mark.label}
              onClick={() => controls.seekTo(mark.index)}
              title={`Jump to “${mark.label}”`}
            >
              {mark.label}
            </Ctl>
          ))}
          <a
            href={window.location.pathname}
            className="rounded-md border border-amber/50 px-2 py-1 font-mono text-[10.5px] font-bold tracking-wider text-amber uppercase transition-colors hover:bg-amber/20"
          >
            exit demo
          </a>
        </div>
      </div>
    </div>
  )
}

function Ctl({
  onClick,
  children,
  title,
  disabled,
}: {
  onClick: () => void
  children: React.ReactNode
  title: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="rounded-md border border-amber/50 px-2 py-1 font-mono text-[10.5px] font-bold tracking-wider text-amber uppercase transition-colors hover:bg-amber/20 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
