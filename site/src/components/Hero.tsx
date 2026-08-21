import { useEffect, useRef } from 'react'
import gsap from 'gsap'

const CONSOLE_URL = '/console/'
const REPO = 'https://github.com/OoJae/kane-loop'

/**
 * The hero is a thesis, not a banner: the claim an agent makes, and the answer.
 * One choreographed entrance — mark draws, lines rise, pane settles — then it
 * stops. Nothing here loops.
 */
export function Hero() {
  const root = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } })
      tl.from('[data-draw]', { strokeDashoffset: 200, duration: 1.1 }, 0)
        .from('[data-rise] > span', { yPercent: 105, duration: 0.95, stagger: 0.07 }, 0.12)
        .from('[data-fade]', { opacity: 0, y: 14, duration: 0.8, stagger: 0.08 }, 0.5)
    }, root)
    return () => ctx.revert()
  }, [])

  return (
    <header
      ref={root}
      className="relative mx-auto flex min-h-[100svh] max-w-[1400px] flex-col px-5 pt-8 lg:px-10"
    >
      <nav className="flex items-center justify-between" aria-label="Main">
        <a href="/" className="flex items-center gap-2.5" aria-label="Kane Loop, home">
          <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
            <g fill="none" strokeWidth="7" strokeLinecap="round">
              <path d="M 32 6 A 26 26 0 0 1 32 58" stroke="#ff3b52" data-draw strokeDasharray="200" />
              <path d="M 32 58 A 22 22 0 0 1 32 14" stroke="#34e39b" data-draw strokeDasharray="200" />
            </g>
          </svg>
          <span className="display text-[15px]" style={{ fontStretch: '110%' }}>
            Kane&nbsp;Loop
          </span>
        </a>

        <div className="label flex items-center gap-5 sm:gap-7">
          <a className="transition-colors hover:text-[color:var(--color-ice)]" href="#loop">
            the loop
          </a>
          <a className="hidden transition-colors hover:text-[color:var(--color-ice)] sm:inline" href="#receipts">
            receipts
          </a>
          <a className="transition-colors hover:text-[color:var(--color-ice)]" href={REPO} target="_blank" rel="noreferrer">
            github ↗
          </a>
        </div>
      </nav>

      {/* The display line spans the full width — at Expanded 11rem it is wider
          than any column, and clipping the green "it." kills the whole joke. */}
      <div className="flex flex-1 flex-col justify-center pt-[clamp(2rem,6vh,4.5rem)] pb-[clamp(2rem,7vh,5rem)]">
        <div>
          <p data-fade className="label">
            a closed loop for coding agents
          </p>

          {/* Two words, as large as they will go. The setup line does the
              explaining so the display line can just land. */}
          <h1 className="mt-5">
            <span data-rise className="block overflow-hidden pb-[0.1em]">
              <span className="block text-[clamp(1.15rem,2.6vw,2.1rem)] leading-tight font-medium tracking-[-0.02em] text-[color:var(--color-dim)]">
                The agent says it works.
              </span>
            </span>
            <span data-rise className="mt-1 block overflow-hidden pb-[0.06em]">
              <span className="display block text-[clamp(3.4rem,13vw,11rem)] whitespace-nowrap">
                Prove <span style={{ color: '#34e39b' }}>it.</span>
              </span>
            </span>
          </h1>

        </div>

        {/* Supporting copy sits under the display line, on the grid. */}
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] lg:gap-16">
          <div>
          <p data-fade className="max-w-[52ch] text-[clamp(1rem,1.05vw,1.15rem)] leading-[1.6] text-[color:var(--color-dim)]">
            A hook fires a real browser on every save. When it fails, the failure goes straight
            back into the agent’s context — and a Stop gate won’t let it say “done” while the app
            is red.
          </p>

          <div data-fade className="mt-9 flex flex-wrap items-center gap-3">
            <a
              href={`${CONSOLE_URL}?replay=live-loop`}
              className="group inline-flex items-center gap-2.5 rounded-lg bg-[color:var(--color-ice)] px-5 py-3 text-[14px] font-semibold text-[color:var(--color-ink)] transition-transform duration-200 hover:-translate-y-0.5"
            >
              Watch a real run
              <span aria-hidden className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
            </a>
            <code className="data rounded-lg border border-[color:var(--color-line)] px-4 py-3 text-[color:var(--color-dim)]">
              ./scripts/dev.sh
            </code>
          </div>
        </div>

          <div data-fade className="max-w-[36ch] lg:pt-2">
            <p className="label">scroll to run the loop</p>
            <p className="mt-3 text-[15px] leading-[1.7] text-[color:var(--color-dim)]">
              Everything you are about to see is replayed from a committed log of an actual run —
              assertions, timings, credits.
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
