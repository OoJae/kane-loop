/** Runtime configuration. Every value is overridable through Vite env vars. */

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Local dev serves the UI on 4321 and the orchestrator on 4000. Hosted, the
 * orchestrator serves this page itself, so the API is the same origin — hard
 * coding localhost there would point every visitor at their own machine.
 */
function defaultServerUrl(): string {
  const configured = import.meta.env.VITE_SERVER_URL?.trim()
  if (configured) return configured
  if (typeof window === 'undefined') return 'http://localhost:4000'
  return window.location.port === '4321' ? 'http://localhost:4000' : window.location.origin
}

export const SERVER_URL = trimSlash(defaultServerUrl())

/** Hosted, the target app is proxied by the orchestrator under /app. */
function defaultTargetAppUrl(): string {
  const configured = import.meta.env.VITE_TARGET_APP_URL?.trim()
  if (configured) return configured
  if (typeof window === 'undefined') return 'http://localhost:5173'
  return window.location.port === '4321'
    ? 'http://localhost:5173'
    : `${window.location.origin}/app`
}

export const TARGET_APP_URL = trimSlash(defaultTargetAppUrl())

/**
 * The orchestrator serves the WebSocket on the same origin as its HTTP API
 * (`ws://localhost:4000`). `VITE_WS_URL` overrides it outright for the case
 * where the socket lives on a path.
 */
export const WS_URL =
  import.meta.env.VITE_WS_URL?.trim() ||
  SERVER_URL.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:')

export const RUN_ENDPOINT = `${SERVER_URL}/run`
export const STOP_ENDPOINT = `${SERVER_URL}/stop`
/** Tells us whether this instance is gated at all — no key needed to ask. */
export const HEALTH_ENDPOINT = `${SERVER_URL}/health`
/**
 * Behind the same key as /run, but free: no credits, no side effects. That
 * makes it the right way to check a pasted key before spending anything.
 */
export const DIAG_ENDPOINT = `${SERVER_URL}/diag`
/** Put the seeded bug back, so the demo can be run more than once. */
export const RESET_ENDPOINT = `${SERVER_URL}/reset`
/** The orchestrator serves saved Kane artefacts here. */
export const EVIDENCE_BASE = `${SERVER_URL}/evidence`
/** Kane's screenshots live outside the repo, so the orchestrator serves them. */
export const SHOT_ENDPOINT = `${SERVER_URL}/shot`

/*
 * There is deliberately no RUN_KEY export.
 *
 * It used to read import.meta.env.VITE_RUN_KEY, which Vite inlines at BUILD
 * time — inside `docker build`, long before the host injects its variables — so
 * the shipped bundle always contained the empty string and the Run button could
 * never authenticate. Supplying it as a build arg would have fixed the symptom
 * by publishing an execution key in a public bundle.
 *
 * The key is now pasted at the point of use and held in memory only. The read is
 * gone rather than merely unused, so restoring the old behaviour requires
 * inventing a mechanism instead of connecting two things that already look
 * wired together.
 */
