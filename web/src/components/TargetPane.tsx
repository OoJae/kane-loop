import { useCallback, useEffect, useRef, useState } from 'react'
import { Pane } from './Pane'
import { TARGET_APP_URL } from '../lib/config'
import { clockTime } from '../lib/format'

/**
 * Left pane — the live app under test, in an iframe, with a manual reload so a
 * viewer can prove persistence for themselves rather than taking Kane's word.
 */
export function TargetPane() {
  const [reloadKey, setReloadKey] = useState(0)
  const [reloadedAt, setReloadedAt] = useState<number | null>(null)
  const [reachable, setReachable] = useState<boolean | null>(null)
  const [spin, setSpin] = useState(false)
  const spinTimer = useRef<number | null>(null)

  const probe = useCallback(async () => {
    try {
      await fetch(TARGET_APP_URL, { mode: 'no-cors', cache: 'no-store' })
      setReachable(true)
    } catch {
      setReachable(false)
    }
  }, [])

  useEffect(() => {
    void probe()
    const id = window.setInterval(() => void probe(), 5000)
    return () => window.clearInterval(id)
  }, [probe])

  useEffect(
    () => () => {
      if (spinTimer.current !== null) window.clearTimeout(spinTimer.current)
    },
    [],
  )

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1)
    setReloadedAt(Date.now())
    setSpin(true)
    if (spinTimer.current !== null) window.clearTimeout(spinTimer.current)
    spinTimer.current = window.setTimeout(() => setSpin(false), 700)
    void probe()
  }, [probe])

  const host = TARGET_APP_URL.replace(/^https?:\/\//, '')

  return (
    <Pane
      step="01"
      title="App under test"
      subtitle="Kane Notes · live"
      tone={reachable === false ? 'amber' : 'neutral'}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-line-soft bg-ink-2/40 px-3 py-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            reachable === false ? 'bg-amber' : 'bg-green'
          } ${reachable === null ? 'animate-blink' : ''}`}
          aria-hidden
        />
        <code className="min-w-0 flex-1 truncate rounded-md bg-panel-2 px-2 py-1 font-mono text-[12px] text-mist">
          {host}
        </code>
        <a
          href={TARGET_APP_URL}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-mist transition-colors hover:border-accent/60 hover:text-ice"
          title="Open the app in a new tab"
        >
          Open ↗
        </a>
        <button
          type="button"
          onClick={reload}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/45 bg-accent/12 px-3 py-1.5 text-[13px] font-bold text-accent transition-all hover:border-accent hover:bg-accent/20 active:translate-y-px"
          title="Reload the app — proves state survives a real reload"
        >
          <span
            className={`inline-block text-[14px] leading-none ${spin ? 'animate-[spin_0.7s_linear]' : ''}`}
            aria-hidden
          >
            ⟳
          </span>
          Reload
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-white">
        <iframe
          key={reloadKey}
          src={`${TARGET_APP_URL}/?kaneReload=${reloadKey}`}
          title="App under test"
          className="h-full w-full border-0"
        />
        {reachable === false ? (
          <div className="absolute inset-0 grid place-items-center bg-ink/95 p-6 text-center">
            <div className="max-w-xs">
              <p className="text-[15px] font-bold text-amber">Target app is not running</p>
              <p className="mt-2 text-[13px] leading-relaxed text-mist">
                Start it with{' '}
                <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-[12px] text-ice">
                  npm run dev
                </code>{' '}
                in <code className="font-mono text-[12px] text-ice">target-app/</code>, then hit
                Reload.
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="shrink-0 border-t border-line-soft bg-ink-2/40 px-3 py-2 text-[11px] text-dim">
        {reloadedAt
          ? `Manually reloaded at ${clockTime(reloadedAt)} — state you still see survived a real page load.`
          : 'Hit Reload after a fix to see persistence with your own eyes.'}
      </footer>
    </Pane>
  )
}
