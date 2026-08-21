import { useEffect, useRef, useState, type FormEvent } from 'react'

/**
 * Runtime entry for the run key.
 *
 * The key is never built into this bundle and never stored: the console iframes
 * the app-under-test from the SAME origin with no sandbox, and that app is
 * exactly what the agent edits — so anything in web storage is readable by the
 * code the key authorises. It lives in React state and dies with the page.
 *
 * Colour discipline matters here more than usual. Red and green are Kane's
 * verdicts in this product; spending either on an auth state would blunt the one
 * signal the whole thing is about. So this bar is neutral, red appears only for
 * an actual rejection, and amber only for "could not check" — which is the
 * existing UNVERIFIED semantic: no verdict, and that is not a pass.
 */
export type KeyState =
  | 'idle'
  | 'checking'
  | 'accepted'
  | 'rejected'
  | 'stale'
  | 'unreachable'
  | 'blocked'
  | 'limited'

interface KeyBarProps {
  state: KeyState
  /** Seconds left on a rate-limit block, when state is 'limited'. */
  retryAfter?: number
  onSubmit: (key: string) => void
  /** Focus the field — after a blocked Run, a clear, or a mid-session de-arm. */
  focusToken: number
}

const PILL: Record<KeyState, string> = {
  idle: 'key required',
  checking: 'checking',
  accepted: 'key accepted',
  rejected: 'key rejected',
  stale: 'key rejected',
  unreachable: 'cannot check',
  blocked: 'key required',
  limited: 'too many attempts',
}

function statusLine(state: KeyState, retryAfter?: number): string {
  switch (state) {
    case 'checking':
      return 'Checking the key…'
    case 'accepted':
      return 'Key accepted. Run is enabled until you reload.'
    case 'rejected':
      return 'That key was not accepted. Check that the whole key was pasted, then try again.'
    case 'stale':
      return 'The key is no longer accepted — the orchestrator was probably redeployed. Paste it again to re-enable Run.'
    case 'unreachable':
      return 'Could not reach the orchestrator to check the key. Try again in a few seconds.'
    case 'blocked':
      return 'Paste the run key to start a run. Nothing was sent.'
    case 'limited':
      return `Too many incorrect keys. Try again in ${retryAfter ?? 30} seconds.`
    default:
      return ''
  }
}

/** Tone is carried by the pill and the border; the field itself never shifts. */
function toneClasses(state: KeyState): { frame: string; pill: string; text: string } {
  if (state === 'rejected' || state === 'stale' || state === 'limited') {
    return {
      frame: 'border-red/50',
      pill: 'border-red/50 bg-red/10 text-red',
      text: 'text-red-soft',
    }
  }
  if (state === 'unreachable') {
    return {
      frame: 'border-amber/50',
      pill: 'border-amber/50 bg-amber/10 text-amber',
      text: 'text-amber',
    }
  }
  if (state === 'accepted') {
    return {
      frame: 'border-accent/60',
      pill: 'border-accent/50 bg-accent/10 text-accent',
      text: 'text-accent',
    }
  }
  return {
    frame: state === 'blocked' ? 'border-accent ring-2 ring-accent/25' : 'border-line',
    pill: 'border-line bg-panel-2 text-mist',
    text: 'text-mist',
  }
}

export function KeyBar({ state, retryAfter, onSubmit, focusToken }: KeyBarProps) {
  const [draft, setDraft] = useState('')
  const [visible, setVisible] = useState(false)
  const input = useRef<HTMLInputElement | null>(null)

  // Focus follows a user-initiated change only. Never on mount: that would steal
  // focus from the prompt input, which is the primary control on this page.
  useEffect(() => {
    if (focusToken > 0) input.current?.focus()
  }, [focusToken])

  // A rejected key is usually a paste that dropped a character, so keep the
  // value and select it — the next paste then replaces it in one gesture.
  useEffect(() => {
    if (state === 'rejected' || state === 'stale') input.current?.select()
  }, [state])

  const tone = toneClasses(state)
  const busy = state === 'checking'
  const line = statusLine(state, retryAfter)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit(draft)
  }

  return (
    <section
      aria-labelledby="run-key-heading"
      className={`animate-rise mt-3 shrink-0 rounded-xl border bg-panel/80 px-4 py-3 transition-colors ${tone.frame}`}
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center xl:gap-3">
          <h2
            id="run-key-heading"
            className={`shrink-0 self-start rounded border px-1.5 py-0.5 font-mono text-[10.5px] font-black tracking-[0.14em] uppercase transition-colors xl:self-auto ${tone.pill}`}
          >
            {PILL[state]}
          </h2>

          {/* The live region must exist from mount, rendered empty, or the first
              update is announced to nobody. Polite, never assertive: the verdict
              banner has its own polite region and it matters more than this. */}
          <p
            id="run-key-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`min-w-0 text-[13px] leading-snug ${line ? tone.text : 'text-mist'}`}
          >
            {line ||
              'A run spends the operator’s Kane and model credits and executes code in the container, so it is gated. The key ships with the submission.'}
          </p>

          {state === 'idle' || state === 'blocked' ? (
            <a
              href="?replay=live-loop"
              className="shrink-0 font-mono text-[11px] font-bold tracking-[0.1em] text-dim uppercase underline decoration-dotted underline-offset-4 transition-colors hover:text-ice"
            >
              watch a recorded run →
            </a>
          ) : null}
        </div>

        {/* Its own form, so Enter here can never fire Run. */}
        <form onSubmit={handleSubmit} className="flex shrink-0 flex-wrap items-center gap-2">
          <label
            htmlFor="run-key"
            className="w-full shrink-0 font-mono text-[10.5px] font-bold tracking-[0.14em] text-dim uppercase sm:w-auto"
          >
            run key
          </label>
          <div className="relative min-w-[140px] flex-1 xl:w-[280px] xl:flex-none">
            <input
              id="run-key"
              ref={input}
              type={visible ? 'text' : 'password'}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              // Paste and it resolves — no button press. Trim first: a copy out
              // of a form field or an email reliably carries a trailing newline.
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text').trim()
                if (pasted === '') return
                event.preventDefault()
                setDraft(pasted)
                onSubmit(pasted)
              }}
              placeholder="paste the key"
              aria-describedby="run-key-status"
              aria-invalid={state === 'rejected' || state === 'stale'}
              autoComplete="off"
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              enterKeyHint="go"
              data-1p-ignore
              data-lpignore="true"
              className="h-9 w-full rounded-lg border border-line bg-ink pr-14 pl-3 font-mono text-[13px] text-ice placeholder:text-dim focus:border-accent focus:ring-2 focus:ring-accent/25 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-pressed={visible}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] font-bold text-dim uppercase transition-colors hover:text-mist"
            >
              show
            </button>
          </div>
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            className="h-9 shrink-0 rounded-lg border border-line bg-panel-2 px-4 text-[13px] font-bold text-mist transition-colors hover:border-accent/60 hover:text-accent disabled:cursor-not-allowed disabled:text-dim disabled:hover:border-line"
          >
            {busy ? 'Checking…' : 'Enable Run'}
          </button>
        </form>
      </div>
    </section>
  )
}
