import { useCallback, useEffect, useRef, useState } from 'react'
import { normaliseMessage, type NormalisedMessage } from './protocol'

export type ConnectionState = 'connecting' | 'open' | 'reconnecting' | 'offline'

export interface Connection {
  state: ConnectionState
  /** Seconds remaining until the next automatic retry (0 when not waiting). */
  retryIn: number
  attempts: number
  reconnectNow: () => void
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 8000]

/**
 * Resilient WebSocket client. The orchestrator can come and go — the file-based
 * event log means a reconnect replays history, so aggressive retrying is safe.
 */
export function useSocket(
  url: string,
  onMessage: (message: NormalisedMessage) => void,
  enabled = true,
): Connection {
  const [state, setState] = useState<ConnectionState>(enabled ? 'connecting' : 'offline')
  const [retryIn, setRetryIn] = useState(0)
  const [attempts, setAttempts] = useState(0)

  const handlerRef = useRef(onMessage)
  handlerRef.current = onMessage

  const socketRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)
  const attemptRef = useRef(0)
  const closedRef = useRef(false)
  const connectRef = useRef<() => void>(() => {})

  const clearTimers = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    if (tickRef.current !== null) window.clearInterval(tickRef.current)
    timerRef.current = null
    tickRef.current = null
    setRetryIn(0)
  }, [])

  const scheduleReconnect = useCallback(() => {
    if (closedRef.current) return
    const delay = BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)]
    attemptRef.current += 1
    setAttempts(attemptRef.current)
    setState('reconnecting')

    let remaining = Math.ceil(delay / 1000)
    setRetryIn(remaining)
    if (tickRef.current !== null) window.clearInterval(tickRef.current)
    tickRef.current = window.setInterval(() => {
      remaining -= 1
      setRetryIn(Math.max(0, remaining))
    }, 1000)

    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      clearTimers()
      connectRef.current()
    }, delay)
  }, [clearTimers])

  const connect = useCallback(() => {
    if (closedRef.current) return
    clearTimers()

    const existing = socketRef.current
    if (existing) {
      existing.onclose = null
      existing.onerror = null
      existing.onmessage = null
      existing.onopen = null
      if (
        existing.readyState === WebSocket.OPEN ||
        existing.readyState === WebSocket.CONNECTING
      ) {
        existing.close()
      }
      socketRef.current = null
    }

    setState((previous) => (previous === 'reconnecting' ? 'reconnecting' : 'connecting'))

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      scheduleReconnect()
      return
    }
    socketRef.current = socket

    socket.onopen = () => {
      attemptRef.current = 0
      setAttempts(0)
      setState('open')
      clearTimers()
    }

    socket.onmessage = (raw) => {
      if (typeof raw.data !== 'string') return
      // Tolerate a server that batches several NDJSON lines into one frame.
      for (const line of raw.data.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        let parsed: unknown
        try {
          parsed = JSON.parse(trimmed)
        } catch {
          continue
        }
        const message = normaliseMessage(parsed)
        if (message) handlerRef.current(message)
      }
    }

    socket.onerror = () => {
      // `onclose` always follows; retry logic lives there.
    }

    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null
      if (closedRef.current) return
      scheduleReconnect()
    }
  }, [url, clearTimers, scheduleReconnect])

  connectRef.current = connect

  const reconnectNow = useCallback(() => {
    attemptRef.current = 0
    setAttempts(0)
    connectRef.current()
  }, [])

  useEffect(() => {
    if (!enabled) {
      setState('offline')
      return
    }
    closedRef.current = false
    connect()
    return () => {
      closedRef.current = true
      clearTimers()
      const socket = socketRef.current
      if (socket) {
        socket.onclose = null
        socket.close()
        socketRef.current = null
      }
    }
  }, [enabled, connect, clearTimers])

  return { state, retryIn, attempts, reconnectNow }
}
