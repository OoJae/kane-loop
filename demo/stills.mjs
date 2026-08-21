import { chromium, B, hold, glide } from './lib.mjs'
import fs from 'node:fs'
fs.mkdirSync('capture/stills', { recursive: true })
// 2x plates: crisp enough to push in on without softening.
const b = await chromium.launch({ args: ['--hide-scrollbars'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
const grab = async (n) => { await p.screenshot({ path: `capture/stills/${n}.png` }); console.log('  ▸ ' + n) }

await p.goto(B + '/', { waitUntil: 'networkidle' }); await hold(p, 3500)
await grab('hero')
const g = await p.evaluate(() => { const e = document.querySelector('#loop'); return { top: e.getBoundingClientRect().top + scrollY, h: e.offsetHeight } })
for (const [i, n] of [[3,'beat-red'],[4,'beat-inject'],[6,'beat-green'],[7,'beat-gate']]) {
  await p.evaluate((y) => window.scrollTo(0, y), g.top + (g.h - 1080) * ((i + 0.5) / 8))
  await hold(p, 1200); await grab(n)
}
for (const [path, name] of [['/how-it-works','page-how'],['/evidence','page-evidence'],['/log','page-log']]) {
  await p.goto(B + path, { waitUntil: 'networkidle' }); await hold(p, 2000); await grab(name)
}
await p.goto(B + '/console/?replay=live-loop', { waitUntil: 'networkidle' }); await hold(p, 2500); await grab('console-idle')
await b.close()
