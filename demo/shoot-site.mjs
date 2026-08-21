import { chromium, B, glide, hold } from './lib.mjs'
import fs from 'node:fs'

const W = 1920, H = 1080
const shot = async (name, fn, { stills = false } = {}) => {
  const dir = `capture/${name}`
  fs.rmSync(dir, { recursive: true, force: true })
  const ctx = await chromium.launchPersistentContext('', {
    viewport: { width: W, height: H },
    recordVideo: { dir, size: { width: W, height: H } },
    args: ['--hide-scrollbars', '--force-device-scale-factor=1',
           '--disable-blink-features=AutomationControlled'],
  })
  const p = ctx.pages()[0]
  const t0 = Date.now()
  try { await fn(p) } catch (e) { console.log(`  ! ${name}: ${e.message.slice(0, 80)}`) }
  await ctx.close()
  const f = fs.readdirSync(dir).find((x) => x.endsWith('.webm'))
  if (f) fs.renameSync(`${dir}/${f}`, `capture/${name}.webm`)
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`  ✓ ${name.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

// ── A. the hero, and its entrance ────────────────────────────────────────────
await shot('01-hero', async (p) => {
  await p.goto(B + '/', { waitUntil: 'networkidle' })
  await hold(p, 4200)                       // let the GSAP entrance play out
})

// ── B. the signature: scrolling runs the loop ────────────────────────────────
await shot('02-loop-scroll', async (p) => {
  await p.goto(B + '/', { waitUntil: 'networkidle' })
  await hold(p, 2600)
  const g = await p.evaluate(() => {
    const e = document.querySelector('#loop')
    return { top: e.getBoundingClientRect().top + scrollY, h: e.offsetHeight }
  })
  const span = g.h - H
  await glide(p, g.top, 1400)               // settle into the pin
  await hold(p, 900)
  // Walk the eight beats, pausing on each so the verdict lands.
  for (let i = 0; i < 8; i++) {
    await glide(p, g.top + span * ((i + 0.5) / 8), 900)
    await hold(p, i === 3 || i === 6 || i === 7 ? 1500 : 850)   // linger on RED, GREEN, gate
  }
  await hold(p, 700)
})

// ── C. the three sections below the scene ────────────────────────────────────
await shot('03-sections', async (p) => {
  await p.goto(B + '/', { waitUntil: 'networkidle' })
  await hold(p, 1600)
  for (const id of ['mechanism', 'receipts', 'try']) {
    const y = await p.evaluate((i) => {
      const e = document.getElementById(i)
      return e.getBoundingClientRect().top + scrollY - 40
    }, id)
    await glide(p, y, 1500)
    await hold(p, 2200)
  }
})

// ── D–F. the three pages behind the landing page ─────────────────────────────
for (const [name, path, stops] of [
  ['04-how-it-works', '/how-it-works', 4],
  ['05-evidence', '/evidence', 3],
  ['06-log', '/log', 4],
]) {
  await shot(name, async (p) => {
    await p.goto(B + path, { waitUntil: 'networkidle' })
    await hold(p, 2000)
    const doc = await p.evaluate(() => document.body.scrollHeight)
    for (let i = 1; i <= stops; i++) {
      await glide(p, ((doc - H) * i) / (stops + 0.5), 1600)
      await hold(p, 1700)
    }
  })
}
console.log('site footage complete')
