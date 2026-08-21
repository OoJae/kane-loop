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
/** The orchestrator serves saved Kane artefacts here. */
export const EVIDENCE_BASE = `${SERVER_URL}/evidence`
/** Kane's screenshots live outside the repo, so the orchestrator serves them. */
export const SHOT_ENDPOINT = `${SERVER_URL}/shot`

/**
 * Key for POST /run on a hosted instance. Baked in at build time so the
 * submitted URL is usable by judges without a login; the point of the gate is to
 * keep a public URL from spending the operator's Anthropic and Kane credits on
 * passers-by, not to keep a secret from the people we handed it to.
 */
export const RUN_KEY = import.meta.env.VITE_RUN_KEY?.trim() || ''
