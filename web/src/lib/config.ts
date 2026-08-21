/** Runtime configuration. Every value is overridable through Vite env vars. */

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

export const SERVER_URL = trimSlash(
  import.meta.env.VITE_SERVER_URL?.trim() || 'http://localhost:4000',
)

export const TARGET_APP_URL = trimSlash(
  import.meta.env.VITE_TARGET_APP_URL?.trim() || 'http://localhost:5173',
)

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
