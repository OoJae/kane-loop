import { chromium, B, KEY, hold } from './lib.mjs'
import fs from 'node:fs'

const W = 1920, H = 1080
const shot = async (name, fn) => {
  const dir = `capture/${name}`
  fs.rmSync(dir, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext('', {
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
    args: ['--hide-scrollbars', '--force-device-scale-factor=1'],
  })
  const p = ctx.pages()[0]
  const t0 = Date.now()
  try { await fn(p) } catch (e) { console.log(`  ! ${name}: ${e.message.slice(0, 90)}`) }
  await ctx.close()
  const f = fs.readdirSync(dir).find((x) => x.endsWith('.webm'))
  if (f) fs.renameSync(`${dir}/${f}`, `capture/${name}.webm`)
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`  ✓ ${name.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

// ── G. the committed run, replayed line by line ──────────────────────────────
await shot('07-replay-loop', async (p) => {
  await p.goto(B + '/console/?replay=live-loop', { waitUntil: 'networkidle' })
  await hold(p, 44000)                       // the whole 38s replay, plus handles
})

// ── H. the gate refusing to release ──────────────────────────────────────────
await shot('08-replay-gate', async (p) => {
  await p.goto(B + '/console/?replay=gate-blocks', { waitUntil: 'networkidle' })
  await hold(p, 50000)
})

// ── I. the key: a gated instance, unlocked at the point of use ───────────────
await shot('09-keybar', async (p) => {
  await p.goto(B + '/console/', { waitUntil: 'networkidle' })
  await hold(p, 2600)
  await p.click('#run-key')
  await hold(p, 700)
  await p.type('#run-key', KEY, { delay: 55 })   // visible, character by character
  await hold(p, 900)
  await p.click('button:has-text("Enable Run")')
  await hold(p, 4200)                            // accepted → chip → bar stands down
})

// ── J. the whole loop, live, on the deployed instance ────────────────────────
await shot('10-live-run', async (p) => {
  await p.goto(B + '/console/', { waitUntil: 'networkidle' })
  await hold(p, 2200)
  await p.fill('#run-key', KEY)
  await p.click('button:has-text("Enable Run")')
  await hold(p, 3000)
  await p.click('input[aria-label="Feature request for the coding agent"]')
  await p.type('input[aria-label="Feature request for the coding agent"]',
    'the dark mode toggle loses its state on reload — fix it.', { delay: 42 })
  await hold(p, 900)
  await p.click('button:has-text("Run")')
  // Ride the whole loop: RED, injection, the agent's edit, GREEN, gate released.
  for (let i = 0; i < 30; i++) {
    await hold(p, 5000)
    const s = await p.evaluate(() => {
      const t = document.body.innerText
      return (t.match(/\b(IDLE|RUNNING|RED|GREEN|UNVERIFIED)\b/) || [])[0]
    })
    if (i > 4 && s === 'GREEN') { await hold(p, 6000); break }
  }
})
console.log('console footage complete')
