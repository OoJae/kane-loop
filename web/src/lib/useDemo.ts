import { useCallback, useEffect, useRef, useState } from 'react'
import { DEMO_SCRIPT, type DemoStep } from './demo'
import type { Action } from './store'
import type { NormalisedMessage } from './protocol'

export interface DemoControls {
  index: number
  total: number
  playing: boolean
  finished: boolean
  nextLabel: string | null
  lastLabel: string | null
  play: () => void
  pause: () => void
  step: () => void
  restart: () => void
  seekTo: (index: number) => void
}

/** Stamp a fresh `ts` so replayed events carry the current wall clock. */
function stamp(message: NormalisedMessage): NormalisedMessage {
  const event = message.event as Record<string, unknown>
  if (event && typeof event === 'object' && 'source' in event) {
    return { ...message, event: { ...event, ts: new Date().toISOString() } as NormalisedMessage['event'] }
  }
  return message
}

function dispatchStep(step: DemoStep, dispatch: (action: Action) => void): void {
  const at = Date.now()
  if (step.prompt) {
    dispatch({ kind: 'prompt', text: step.prompt, at })
    return
  }
  if (step.message) {
    dispatch({ kind: 'message', message: stamp(step.message), at })
  }
}

/**
 * Drives DEMO_SCRIPT through the same reducer the live socket uses.
 * Pause/step exist so a rehearsal (or a screenshot) can be held on a beat.
 */
export function useDemo(enabled: boolean, dispatch: (action: Action) => void): DemoControls {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const timerRef = useRef<number | null>(null)
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || !playing) {
      clearTimer()
      return
    }
    if (index >= DEMO_SCRIPT.length) {
      clearTimer()
      setPlaying(false)
      return
    }
    const step = DEMO_SCRIPT[index]
    timerRef.current = window.setTimeout(() => {
      dispatchStep(step, dispatchRef.current)
      setIndex((current) => current + 1)
    }, step.after)
    return clearTimer
  }, [enabled, playing, index, clearTimer])

  const step = useCallback(() => {
    setIndex((current) => {
      if (current >= DEMO_SCRIPT.length) return current
      dispatchStep(DEMO_SCRIPT[current], dispatchRef.current)
      return current + 1
    })
  }, [])

  const seekTo = useCallback(
    (target: number) => {
      clearTimer()
      setPlaying(false)
      setIndex((current) => {
        if (target <= current) {
          // Rewind: replay from a clean slate up to the target.
          dispatchRef.current({ kind: 'reset' })
          for (let i = 0; i < target; i += 1) {
            dispatchStep(DEMO_SCRIPT[i], dispatchRef.current)
          }
          return target
        }
        for (let i = current; i < Math.min(target, DEMO_SCRIPT.length); i += 1) {
          dispatchStep(DEMO_SCRIPT[i], dispatchRef.current)
        }
        return Math.min(target, DEMO_SCRIPT.length)
      })
    },
    [clearTimer],
  )

  const restart = useCallback(() => {
    clearTimer()
    dispatchRef.current({ kind: 'reset' })
    setIndex(0)
    setPlaying(true)
  }, [clearTimer])

  return {
    index,
    total: DEMO_SCRIPT.length,
    playing,
    finished: index >= DEMO_SCRIPT.length,
    nextLabel: index < DEMO_SCRIPT.length ? DEMO_SCRIPT[index].label : null,
    lastLabel: index > 0 ? DEMO_SCRIPT[index - 1].label : null,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step,
    restart,
    seekTo,
  }
}
