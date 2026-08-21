import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { TargetPane } from './components/TargetPane'
import { TranscriptPane } from './components/TranscriptPane'
import { VerifierPane } from './components/VerifierPane'
import { DemoBanner } from './components/DemoBanner'
import { ReplayBanner } from './components/ReplayBanner'
import { KeyBar, type KeyState } from './components/KeyBar'
import { initialState, reducer } from './lib/store'
import { useSocket } from './lib/useSocket'
import { useDemo } from './lib/useDemo'
import {
  DIAG_ENDPOINT,
  HEALTH_ENDPOINT,
  RUN_ENDPOINT,
  SERVER_URL,
  STOP_ENDPOINT,
  WS_URL,
} from './lib/config'
import { getDemoScript, type DemoScript } from './lib/demo'
import { findRecording, loadRecording, type Recording } from './lib/replay'
import type { NormalisedMessage } from './lib/protocol'

/**
 * Demo mode is opt-in only: `?demo=1` (red → green loop) or `?demo=gate`
 * (the Stop gate blocking "done"). Anything else means live mode.
 */
const EMPTY_SCRIPT: DemoScript = { name: 'recording', steps: [], marks: [] }

/** Hosted or local? Decides which "can't reach it" advice is actually useful. */
const LOCAL_SERVER = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(
  (() => {
    try {
      return new URL(SERVER_URL).hostname
    } catch {
      return 'localhost'
    }
  })(),
)

function useDemoMode(): { demo: boolean; script: DemoScript; recording: Recording | undefined } {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const replayParam = params.get('replay')
    if (replayParam !== null && replayParam !== '0' && replayParam !== 'false') {
      const recording = findRecording(replayParam)
      if (recording !== undefined) return { demo: true, script: EMPTY_SCRIPT, recording }
    }
    const value = params.get('demo')
    const demo = value !== null && value !== '0' && value !== 'false'
    return { demo, script: getDemoScript(demo ? value : null), recording: undefined }
  }, [])
}

export default function App() {
  const { demo, script, recording } = useDemoMode()

  // A recording is fetched, so the script starts empty and arrives async. Same
  // driver either way — useDemo does not care where the steps came from.
  const [replaySteps, setReplaySteps] = useState<DemoScript | null>(null)
  const [replayError, setReplayError] = useState<string | null>(null)
  useEffect(() => {
    if (recording === undefined) return
    let cancelled = false
    loadRecording(recording)
      .then((steps) => { if (!cancelled) setReplaySteps(steps) })
      .catch((err: unknown) => {
        if (!cancelled) setReplayError(err instanceof Error ? err.message : 'Could not load the recording')
      })
    return () => { cancelled = true }
  }, [recording])
  const [state, dispatch] = useReducer(reducer, initialState)
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * The run key, in memory only — never localStorage, never sessionStorage.
   *
   * This console iframes the app-under-test from the same origin with no
   * sandbox, and that app is precisely what the agent edits. Anything in web
   * storage is therefore readable by the code this key authorises; a value
   * closed over in a hook is not addressable as window.parent.<storage>.
   * The cost is a re-paste after a reload, which validation makes instant.
   */
  const [runKey, setRunKey] = useState('')
  const [keyRequired, setKeyRequired] = useState(false)
  const [keyState, setKeyState] = useState<KeyState>('idle')
  const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined)
  const [keyFocus, setKeyFocus] = useState(0)
  const promptInput = useRef<HTMLInputElement | null>(null)

  /**
   * Ask the orchestrator whether it is gated at all, so the key bar is only ever
   * shown where it is true. Local dev leaves KANE_RUN_SECRET unset, so this
   * feature simply does not exist there.
   *
   * On a network failure we render nothing and let a later 401 surface it —
   * never accuse someone of a missing key when the host is merely cold.
   */
  useEffect(() => {
    if (demo) return
    let cancelled = false
    fetch(HEALTH_ENDPOINT)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { keyRequired?: boolean } | null) => {
        if (!cancelled && body?.keyRequired === true) setKeyRequired(true)
      })
      .catch(() => {
        /* stay silent; a 401 will surface it if it matters */
      })
    return () => {
      cancelled = true
    }
  }, [demo])

  /**
   * A burst of `replay: true` events means the server is re-sending history
   * (fresh connect, or recovery after a drop). Clear first so a reconnect
   * rebuilds the session instead of duplicating it.
   */
  const replayingRef = useRef(false)
  const handleMessage = useCallback((message: NormalisedMessage) => {
    if (message.replay) {
      if (!replayingRef.current) {
        replayingRef.current = true
        dispatch({ kind: 'reset' })
      }
    } else {
      replayingRef.current = false
    }
    dispatch({ kind: 'message', message, at: Date.now() })
  }, [])

  const connection = useSocket(WS_URL, handleMessage, !demo)
  const demoControls = useDemo(demo, dispatch, recording !== undefined ? (replaySteps ?? EMPTY_SCRIPT) : script)

  // The recording is fetched, so the driver first sees an empty script, decides
  // it has finished, and stops. Kick it once the real steps arrive.
  const startedReplayRef = useRef(false)
  useEffect(() => {
    if (replaySteps === null || startedReplayRef.current) return
    startedReplayRef.current = true
    demoControls.restart()
  }, [replaySteps, demoControls])

  /* ------------------------------------------------------------- elapsed */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (state.status !== 'RUNNING') return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [state.status])
  const elapsedMs =
    state.status === 'RUNNING' && state.runningSince !== null
      ? Math.max(0, now - state.runningSince)
      : null

  /* --------------------------------------------------------- tab title */
  useEffect(() => {
    const prefix =
      state.status === 'RED'
        ? '🔴 RED · '
        : state.status === 'GREEN'
          ? '🟢 GREEN · '
          : state.status === 'RUNNING'
            ? '⏱ running · '
            : ''
    document.title = `${prefix}Kane Loop`
  }, [state.status])

  /* ------------------------------------------------------------- submit */
  const submit = useCallback(async (keyOverride?: string) => {
    const text = prompt.trim()
    if (!text || submitting) return

    // Pressing Run with no key is not a dead end and not a disabled button — a
    // dead disabled control is the bug this whole change exists to fix. Send
    // nothing (no doomed POST, no 401 in a network tab someone might
    // screenshot), point at the field that fixes it, and pulse the bar.
    const key = keyOverride ?? runKey
    if (keyRequired && key === '') {
      setKeyState('blocked')
      setKeyFocus((n) => n + 1)
      return
    }

    if (demo) {
      setError(
        'Demo mode is active — nothing is sent anywhere. Exit demo to run against the orchestrator.',
      )
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(RUN_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(key === '' ? {} : { 'x-kane-key': key }),
        },
        body: JSON.stringify({ prompt: text }),
      })

      // Handled in the key bar, not the error strip: the strip has nowhere to
      // put the fix, and two messages for one event is noise.
      if (response.status === 401) {
        setKeyRequired(true)
        setRunKey('')
        setKeyState(key === '' ? 'idle' : 'stale')
        setKeyFocus((n) => n + 1)
        return
      }

      if (response.status === 429) {
        const wait = Number(response.headers.get('retry-after')) || 30
        setKeyRequired(true)
        setRetryAfter(wait)
        setKeyState('limited')
        return
      }

      if (response.status === 409) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
          message?: string
        } | null
        setError(
          body?.error ??
            body?.message ??
            'A run is already in flight. Wait for the current loop to finish before starting another.',
        )
        return
      }

      if (!response.ok) {
        setError(
          `Orchestrator refused the run: ${response.status} ${response.statusText || ''}`.trim(),
        )
        return
      }

      dispatch({ kind: 'prompt', text, at: Date.now() })
      setPrompt('')
    } catch {
      setError(
        LOCAL_SERVER
          ? `Can't reach the orchestrator at ${SERVER_URL}. Start server/ and try again.`
          : `Can't reach the orchestrator at ${new URL(SERVER_URL).host}. Reload the page and try again.`,
      )
    } finally {
      setSubmitting(false)
    }
    // runKey MUST be here. It used to be a module constant, and a callback that
    // closes over a stale empty key is exactly the bug being fixed — in a new
    // place. There is no ESLint in this project to catch it.
  }, [prompt, submitting, demo, runKey, keyRequired])

  /** Ask the orchestrator to abandon the in-flight run (server: POST /stop). */
  const stop = useCallback(async () => {
    if (demo) return
    try {
      const response = await fetch(STOP_ENDPOINT, {
        method: 'POST',
        // /stop is gated now: unauthenticated, it was a free way to destroy
        // evidence mid-run. Whoever started the run holds the key.
        headers: runKey === '' ? {} : { 'x-kane-key': runKey },
      })
      if (!response.ok && response.status !== 409) {
        setError(`Orchestrator could not stop the run: ${response.status}`)
        return
      }
      dispatch({ kind: 'notice', text: 'Stop requested by the operator', at: Date.now() })
    } catch {
      setError(`Can't reach the orchestrator at ${SERVER_URL}.`)
    }
  }, [demo, runKey])

  /**
   * Validate a pasted key against GET /diag — the same gate as /run, but free:
   * no credits, no side effects. So a key can be proved good before it is ever
   * used to spend anything.
   */
  const submitKey = useCallback(
    async (candidate: string) => {
      const trimmed = candidate.trim()
      if (trimmed === '') return

      // Only show "checking" if it is actually slow. A 60ms answer that flashes
      // a spinner reads as jank; once shown, it stays up long enough to read.
      const shownAt = Date.now()
      const spinner = window.setTimeout(() => setKeyState('checking'), 120)
      const settle = (next: KeyState) => {
        window.clearTimeout(spinner)
        const shown = Date.now() - shownAt
        const hold = shown > 120 && shown < 380 ? 380 - shown : 0
        window.setTimeout(() => setKeyState(next), hold)
      }

      const abort = new AbortController()
      const timeout = window.setTimeout(() => abort.abort(), 6000)
      try {
        const response = await fetch(DIAG_ENDPOINT, {
          headers: { 'x-kane-key': trimmed },
          signal: abort.signal,
        })
        if (response.ok) {
          setRunKey(trimmed)
          setRetryAfter(undefined)
          settle('accepted')
          // Hold the accepted state long enough to read cause and effect on a
          // screen recording, then stand the bar down.
          window.setTimeout(() => {
            setKeyRequired(false)
            // The bar unmounts with focus inside it; without this, focus falls
            // to <body> and a keyboard user is stranded mid-page.
            promptInput.current?.focus()
          }, 900)
          return
        }
        if (response.status === 429) {
          setRetryAfter(Number(response.headers.get('retry-after')) || 30)
          settle('limited')
          return
        }
        settle('rejected')
      } catch {
        settle('unreachable')
      } finally {
        window.clearTimeout(timeout)
      }
    },
    [],
  )

  return (
    <div className="grid-bg flex h-full min-h-screen flex-col gap-3 bg-ink p-3 xl:h-screen xl:gap-3.5 xl:p-4">
      {recording !== undefined ? <ReplayBanner recording={recording} /> : null}
      {replayError !== null ? (
        <div className="rounded-lg border-2 border-red bg-red/10 px-4 py-2 text-[13px] text-red-soft">
          Could not load the recording: {replayError}. The loop itself runs locally — see the repo
          for the one-command quickstart.
        </div>
      ) : null}
      {demo && recording === undefined ? (
        <>
          <DemoBanner controls={demoControls} />
          <div
            className="pointer-events-none fixed inset-0 z-40 border-[3px] border-amber/45"
            aria-hidden
          />
        </>
      ) : null}

      <TopBar
        value={prompt}
        onChange={setPrompt}
        onSubmit={() => void submit()}
        onStop={() => void stop()}
        submitting={submitting}
        agentBusy={state.agentBusy}
        error={error}
        onDismissError={() => setError(null)}
        connection={connection}
        demo={demo}
        recorded={recording !== undefined}
        promptRef={promptInput}
        keyArmed={runKey !== '' && !demo}
        keyHint={runKey === '' ? '' : runKey.slice(-4)}
        onClearKey={() => {
          setRunKey('')
          setKeyRequired(true)
          setKeyState('idle')
          setKeyFocus((n) => n + 1)
        }}
      />

      {/* Live mode only, and only where the orchestrator says it is gated —
          so a local `./scripts/dev.sh` never sees this at all. */}
      {keyRequired && !demo ? (
        <KeyBar
          state={keyState}
          retryAfter={retryAfter}
          onSubmit={(candidate) => void submitKey(candidate)}
          focusToken={keyFocus}
        />
      ) : null}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.14fr)_minmax(0,1.02fr)] xl:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-[520px] flex-col xl:min-h-0">
          <TargetPane />
        </div>
        <div className="flex min-h-[560px] flex-col xl:min-h-0">
          <TranscriptPane
            items={state.transcript}
            busy={state.agentBusy}
            alert={state.status === 'RED'}
            awaitingKey={keyRequired && runKey === '' && !demo}
          />
        </div>
        <div className="flex min-h-[620px] flex-col xl:min-h-0">
          <VerifierPane state={state} elapsedMs={elapsedMs} />
        </div>
      </main>

      <footer className="shrink-0 overflow-hidden">
        <p className="truncate text-center font-mono text-[11px] tracking-[0.04em] text-dim">
          <span className="text-mist">PostToolUse</span> hook → <span className="text-mist">kane-cli testmd run</span>{' '}
          → <span className="text-red-soft">failure</span> →{' '}
          <span className="text-mist">additionalContext</span> → Claude edits →{' '}
          <span className="text-green">green</span>
          <span className="mx-2 text-line">|</span>
          <span className="text-mist">Stop</span> gate blocks “done” while Kane is red
          <span className="mx-2 text-line">|</span>
          app :5173 · orchestrator :4000 · ui :4321
        </p>
      </footer>

      <FlashOverlay greenFlash={state.greenFlash} redFlash={state.redFlash} />
    </div>
  )
}

/** Whole-screen colour wash on a verdict flip — engineered to read on video. */
function FlashOverlay({ greenFlash, redFlash }: { greenFlash: number; redFlash: number }) {
  return (
    <>
      {greenFlash > 0 ? (
        <div
          key={`green-${greenFlash}`}
          className="animate-sweep pointer-events-none fixed inset-0 z-50 bg-[radial-gradient(120%_80%_at_80%_50%,rgba(52,227,155,0.42),transparent_65%)]"
          aria-hidden
        />
      ) : null}
      {redFlash > 0 ? (
        <div
          key={`red-${redFlash}`}
          className="animate-sweep pointer-events-none fixed inset-0 z-50 bg-[radial-gradient(120%_80%_at_80%_50%,rgba(255,59,82,0.34),transparent_65%)]"
          aria-hidden
        />
      ) : null}
    </>
  )
}
