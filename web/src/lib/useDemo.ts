import { useCallback, useEffect, useRef, useState } from 'react'
import type { DemoScript, DemoStep } from './demo'
import type { Action } from './store'
import type { NormalisedMessage } from './protocol'

export interface DemoControls {
  index: number
  total: number
  playing: boolean
  finished: boolean
  script: DemoScript
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
 * Drives a demo script through the same reducer the live socket uses.
 * Pause/step exist so a rehearsal (or a screenshot) can be held on a beat.
 */
export function useDemo(
  enabled: boolean,
  dispatch: (action: Action) => void,
  script: DemoScript,
): DemoControls {
  const steps = script.steps
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const timerRef = useRef<number | null>(null)
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  const stepsRef = useRef(steps)
  stepsRef.current = steps

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
    if (index >= steps.length) {
      clearTimer()
      setPlaying(false)
      return
    }
    const current = steps[index]
    timerRef.current = window.setTimeout(() => {
      dispatchStep(current, dispatchRef.current)
      setIndex((value) => value + 1)
    }, current.after)
    return clearTimer
  }, [enabled, playing, index, clearTimer, steps])

  const step = useCallback(() => {
    setIndex((current) => {
      const list = stepsRef.current
      if (current >= list.length) return current
      dispatchStep(list[current], dispatchRef.current)
      return current + 1
    })
  }, [])

  const seekTo = useCallback(
    (target: number) => {
      clearTimer()
      setPlaying(false)
      setIndex((current) => {
        const list = stepsRef.current
        const bounded = Math.max(0, Math.min(target, list.length))
        if (bounded <= current) {
          // Rewind: replay from a clean slate up to the target.
          dispatchRef.current({ kind: 'reset' })
          for (let i = 0; i < bounded; i += 1) {
            dispatchStep(list[i], dispatchRef.current)
          }
          return bounded
        }
        for (let i = current; i < bounded; i += 1) {
          dispatchStep(list[i], dispatchRef.current)
        }
        return bounded
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
    total: steps.length,
    playing,
    finished: index >= steps.length,
    script,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    step,
    restart,
    seekTo,
  }
}
