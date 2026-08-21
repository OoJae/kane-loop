---
workflow: product-launch-video
flow: automation
storyboard: no
message: "An agent saying 'done' is a claim, not a result. Kane Loop makes it prove it."
destination: youtube
aspect: 1920x1080
language: en
length: 92s
angle: proof
voice: external
style_preset: broadside
---

## Intent

A demo film for **Kane Loop** — a closed verification loop for AI coding agents, built for the Kane
CLI hackathon. The product's whole argument is epistemic: an agent that says "done" is reporting an
intention, not a result. A hook fires a real Chrome after every save, and when it fails the failure
is injected straight back into the agent's context; a Stop gate refuses "done" while anything is red.

**Show it as is.** Every visual is real footage of the live deployment
(https://kane-loop-production.up.railway.app) — no rebuilt UI, no mockups, no invented numbers.
That constraint is not stylistic, it is the subject: a film about verifiable claims cannot itself
contain an unverifiable frame.

Tone: level, dry, certain. A senior engineer showing a peer something that works. Restraint over
flash — the loudest moments in the film are a red verdict and a green one, and they earn it because
the rest is quiet. No marketing warmth, no exclamation marks, no swooping transitions.

## Assets

Pre-captured by me from the live site; these are the featured material, not supporting b-roll.
Do not re-capture the site for these — screenshots would be strictly worse than the recordings.

- ../../assets/01-hero.mp4 — landing hero, GSAP entrance, "PROVE IT." · opening
- ../../assets/02-loop-scroll.mp4 — THE signature shot: scrolling runs the loop, all 8 beats, the page's own field flips light↔ink with the verdict · the spine of the film
- ../../assets/03-sections.mp4 — mechanism / receipts / try-it sections
- ../../assets/04-how-it-works.mp4 — the three hooks + the oracle manifest, real code on screen
- ../../assets/05-evidence.mp4 — committed run tables, both recordings
- ../../assets/06-log.mp4 — the retraction list
- ../../assets/07-replay-loop.mp4 — the console replaying a committed run: IDLE → RUNNING → RED → injection card → RUNNING → GREEN. **The payoff. The full closed loop.**
- ../../assets/08-replay-gate.mp4 — the gate refusing to release, four times
- ../../assets/09-keybar.mp4 — the runtime key: gated instance unlocked at the point of use
- ../../assets/10-live-run.mp4 — a genuinely live run on the deployment. Kane catches the bug for real (RED + injection card). It does NOT close — the hosted agent runs on a third-party model and did not land the fix. Use for the live RED only; never imply it went green.
- ../../assets/stills/*.png — 2x plates (hero, beat-red, beat-inject, beat-green, beat-gate, page-how, page-evidence, page-log, console-idle) for push-ins and graphic treatment

## Customizations

- Voiceover is **external and verbatim**: `demo/VOICEOVER.md` is the locked script, recorded by the
  user in Clipchamp and delivered as timed audio in nine section files (`01`…`09`). Build the picture
  to those durations when they arrive; until then use the script's intended timecodes as placeholders.
- Brand is already a system — do not invent one. `site/public/brand/brand.md` in the repo is the
  source: ink `#08090c`, paper `#f4f5f7`, fail `#ff3b52`, pass `#34e39b`, dim `#6b7585`;
  display = Archivo pushed to Expanded, data/labels = JetBrains Mono.
- **Red and green are verdicts, never decoration.** They may only appear where the product itself
  would show a verdict. Nothing else in the film may be red or green.
- The verdict must never be colour alone — pair it with the word and the glyph, exactly as the
  product does, because the product does it for a reason.

## Notes

- Every number spoken or shown is checkable in the repo: the failing run is **23s**, **2.0848
  credits**, **3 of 4 steps passed**, assertion `"the page background is still dark"`, reason
  `assertion_failed: @ step 2`. Sourced from `evidence/ui/live-loop.events.ndjson`. Do not round,
  do not embellish, do not invent a figure to fill a frame.
- The console labels a replayed run **RECORDED RUN · NOT LIVE** on screen. Never crop that label out
  of a shot — it is what makes using the replay honest.
- Avoid: stock-SaaS gradients, floating 3D devices, particle fields, typewriter effects on the VO,
  drop shadows on type, any transition that draws attention to itself.
- The film has exactly two loud moments: RED and GREEN. Everything else stays quiet so those land.
