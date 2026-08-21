import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { AppPane } from './AppPane'
import { BEATS } from '../lib/beats'

gsap.registerPlugin(ScrollTrigger)

/**
 * THE signature moment: scrolling runs the loop.
 *
 * The section pins and the scroll position becomes the loop counter. The page's
 * own background travels with the verdict — light while the bug is present,
 * ink once it is fixed — because the seeded bug is a theme-persistence bug and
 * the most on-subject thing this page can do is have it.
 *
 * One scene, one scrub. No scattered reveals.
 */
export function LoopScene() {
  const root = useRef<HTMLElement | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const [index, setIndex] = useState(0)
  const [active, setActive] = useState(false)
  const beat = BEATS[index] ?? BEATS[0]!

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const el = root.current
    if (!el) return

    // Reduced motion: no pin, no scrub. Each beat becomes a state you reach by
    // scrolling normally, so the story survives without movement.
    if (reduced) {
      const activeTrigger = ScrollTrigger.create({
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => setActive(self.isActive),
      })
      const triggers = BEATS.map((_, i) =>
        ScrollTrigger.create({
          trigger: el,
          start: () => `top+=${i * 40}% center`,
          onEnter: () => setIndex(i),
          onEnterBack: () => setIndex(i),
        }),
      )
      return () => {
        activeTrigger.kill()
        triggers.forEach((t) => t.kill())
      }
    }

    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      // Must equal the section's own height minus the pinned viewport, or the
      // scrub finishes before the section does and the last beat is followed by
      // a dead gap. Recomputed on resize because both terms are viewport-relative.
      end: () => `+=${el.offsetHeight - window.innerHeight}`,
      invalidateOnRefresh: true,
      pin: stage.current,
      scrub: true,
      onToggle: (self) => setActive(self.isActive),
      onUpdate: (self) => {
        const next = Math.min(BEATS.length - 1, Math.floor(self.progress * BEATS.length))
        setIndex((current) => (current === next ? current : next))
      },
    })
    return () => st.kill()
  }, [])

  // The field follows the verdict — but ONLY while this scene is on screen.
  // Setting it on mount tinted the hero light, which is the opposite of the
  // intended reading: the page should be ink until the bug is demonstrated.
  useEffect(() => {
    if (!active) {
      delete document.body.dataset.phase
      return
    }
    document.body.dataset.phase = beat.dark ? 'fixed' : 'bug'
    return () => {
      delete document.body.dataset.phase
    }
  }, [active, beat.dark])

  const onInk = beat.dark

  return (
    <section
      ref={root}
      id="loop"
      aria-label="The loop, step by step"
      style={{ height: `${BEATS.length * 60}vh` }}
    >
      <div ref={stage} className="flex min-h-screen items-center py-16">
       <div className="relative mx-auto w-full max-w-[1460px] px-5 lg:px-10">
        {/* The loop rail. Inside a pin this long the reader loses all sense of
            position, and the field is otherwise empty top to bottom. Eight ticks
            for eight real beats — structure, not decoration. */}
        <ol
          aria-hidden
          className="absolute top-1/2 left-10 hidden -translate-y-1/2 flex-col gap-0 xl:flex"
        >
          {BEATS.map((b, i) => {
            const done = i < index
            const now = i === index
            const tone =
              b.verdict === 'RED' ? '#ff3b52' : b.verdict === 'GREEN' ? '#34e39b' : onInk ? '#f3f5f8' : '#14161a'
            return (
              <li key={b.label} className="flex items-center gap-3">
                <span className="flex w-3 flex-col items-center">
                  <span
                    className="w-px transition-all duration-500"
                    style={{
                      height: i === 0 ? 0 : 26,
                      background: done || now ? tone : onInk ? '#242a34' : '#d6dae0',
                      opacity: done || now ? 0.5 : 1,
                    }}
                  />
                  <span
                    className="rounded-full transition-all duration-500"
                    style={{
                      width: now ? 9 : 5,
                      height: now ? 9 : 5,
                      background: now || done ? tone : 'transparent',
                      border: `1px solid ${now || done ? tone : onInk ? '#2c3341' : '#c8ced6'}`,
                      opacity: now ? 1 : done ? 0.45 : 1,
                    }}
                  />
                </span>
                <span
                  className="data whitespace-nowrap transition-all duration-500"
                  style={{
                    color: now ? tone : onInk ? '#5a6270' : '#9aa2ad',
                    opacity: now ? 1 : 0.7,
                    transform: `translateY(${i === 0 ? 0 : 13}px)`,
                    fontWeight: now ? 700 : 400,
                  }}
                >
                  {b.phase}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16 xl:pl-32">
          {/* left: what is happening, in words */}
          <div className="order-2 lg:order-1">
            <p
              className="label transition-colors duration-300"
              style={{ color: onInk ? undefined : '#5c6470' }}
            >
              {beat.label}
            </p>

            <p
              key={index}
              className="mt-4 max-w-[26ch] text-[clamp(1.4rem,2.6vw,2.3rem)] leading-[1.25] font-medium tracking-[-0.02em]"
              style={{
                color: onInk ? '#f3f5f8' : '#14161a',
                animation: 'beatIn 620ms var(--ease-out) both',
              }}
            >
              {beat.line}
            </p>

            {beat.data ? (
              <p
                className="data mt-6 max-w-[46ch] border-l-2 pl-3"
                style={{
                  color: onInk ? '#8b939f' : '#5c6470',
                  borderColor: beat.verdict === 'RED' ? '#ff3b52' : beat.verdict === 'GREEN' ? '#34e39b' : '#242a34',
                }}
              >
                {beat.data}
              </p>
            ) : null}
          </div>

          {/* right: the product, in 3D */}
          <div className="order-1 lg:order-2" style={{ perspective: '1400px' }}>
            <div
              className="pane3d mx-auto w-full max-w-[560px] transition-transform duration-700 will-change-transform"
              style={
                {
                  '--ry': `${onInk ? -6 : -11}deg`,
                  '--rx': `${onInk ? 2 : 5}deg`,
                  transformStyle: 'preserve-3d',
                  transitionTimingFunction: 'var(--ease-out)',
                } as CSSProperties
              }
            >
              <AppPane dark={beat.dark} reloading={beat.reloading ?? false} />
            </div>

            {/* The verdict is the loud thing on this page, so it is set at
                display size — the same way the console shows it. Never colour
                alone: word, glyph and a fixed position carry it too. */}
            <div className="mt-7 flex h-[clamp(3rem,7vw,5rem)] items-center justify-center">
              {beat.verdict ? (
                <p
                  key={beat.verdict + index}
                  className="display flex items-baseline gap-3 text-[clamp(2.6rem,6.5vw,5rem)]"
                  style={{
                    color: beat.verdict === 'RED' ? '#ff3b52' : '#34e39b',
                    animation: 'stamp 520ms var(--ease-out) both',
                  }}
                >
                  <span aria-hidden className="text-[0.45em] leading-none">
                    {beat.verdict === 'RED' ? '✕' : '✓'}
                  </span>
                  {beat.verdict}
                </p>
              ) : null}
            </div>
          </div>
        </div>
       </div>
      </div>
    </section>
  )
}
