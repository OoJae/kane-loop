import pw from '/opt/homebrew/lib/node_modules/@playwright/test/index.js'
export const { chromium } = pw
export const B = 'https://kane-loop-production.up.railway.app'
/**
 * The run key is an EXECUTION credential — a key-holder gets Bash(npm:*) in the
 * container. It is read from the environment and never written down here.
 *
 *   KANE_RUN_KEY=… node shoot-console.mjs
 *
 * An earlier revision of this file hard-coded it, and that revision was pushed
 * to a public repo. The key it exposed has been rotated.
 */
export const KEY = process.env.KANE_RUN_KEY ?? ''
if (!KEY) {
  console.error('✗ KANE_RUN_KEY is not set — the capture scripts cannot start a run without it.')
}

/** Eased smooth scroll driven in-page, so the capture sees real motion. */
export async function glide(page, toY, ms) {
  await page.evaluate(
    ([target, dur]) =>
      new Promise((done) => {
        const from = window.scrollY
        const delta = target - from
        const t0 = performance.now()
        // easeInOutCubic — a camera move, not a jump.
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
        const step = (now) => {
          const t = Math.min(1, (now - t0) / dur)
          window.scrollTo(0, from + delta * ease(t))
          if (t < 1) requestAnimationFrame(step)
          else done()
        }
        requestAnimationFrame(step)
      }),
    [toY, ms],
  )
}

export async function hold(page, ms) { await page.waitForTimeout(ms) }
