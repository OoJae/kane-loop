# Kane Loop — brand

The product had a palette before it had a brand. This writes it down so the site,
the console and the docs stop drifting apart.

## The idea

Kane Loop gives an AI coding agent a real browser and a spine. Everything here
comes from that: the colours are verdicts, the type is industrial, the motion is
a loop closing.

The mark is a loop **caught mid-close** — the stroke starts red on the outside,
travels once round, and finishes green on a tighter radius, so the ends pass
rather than meet. A ring would be static. A gapped ring is a loading spinner.
An iteration is neither.

There is no gradient between the red and the green. A verdict has no in-between,
the way an exit code doesn't: red stops, green starts.

## Colour

| Token | Hex | Role |
|---|---|---|
| `--ink` | `#08090c` | console black — the field |
| `--paper` | `#f4f5f7` | the app in light mode — **the bug state** |
| `--ice` | `#f3f5f8` | primary text on ink |
| `--dim` | `#6b7585` | labels, meta, rules |
| `--fail` | `#ff3b52` | RED. Only ever a verdict. |
| `--pass` | `#34e39b` | GREEN. Only ever a verdict. |

Two accents, not one, because the product **is** a binary verdict. That is the
whole licence for it — do not add a third.

**Red and green never carry meaning alone.** Every verdict pairs the colour with
the word (RED / GREEN), a glyph (✕ / ✓) and a position. Roughly 1 in 12 men
cannot separate these two hues; the product is about trusting what you are told,
so this one is not optional.

## Type

- **Display — Archivo Variable**, width pushed toward Expanded, weight 700–800.
  `clamp(3rem, 9vw, 11rem)`, tracking `-0.03em`, line-height `0.92`.
- **Body — Archivo** 400/500. `clamp(1rem, 1.05vw, 1.15rem)`, line-height `1.6`.
- **Data — JetBrains Mono** 400/700. Labels uppercase, tracking `+0.08em`.
  Used for anything the machine said: assertions, exit codes, timings, NDJSON.

The split is a rule, not a texture: **if a human wrote it, it is Archivo; if the
loop produced it, it is mono.**

## Motion

- Reveals and hero: `cubic-bezier(0.16, 1, 0.3, 1)`, 0.6–1.0 s.
- State flips (RED↔GREEN): `cubic-bezier(0.65, 0, 0.35, 1)`, 0.3–0.4 s.
- Siblings stagger 0.05–0.12 s. Marquees and ambient loops are linear.
- Verdicts **land** rather than fade — the console's `slam` keyframe overshoots
  and settles, because a verdict is an event.
- Animate `transform` and `opacity` only.

## Assets

| File | Use |
|---|---|
| `mark.svg` | primary, ≥24px. No background — drops onto any surface. |
| `favicon.svg` | ≤16px. Heavier stroke, wider pass, because the overlap closes up at tab size. |
| `lockup.svg` | mark + wordmark, horizontal. Text is live and inherits Archivo. |

## Don't

- Don't put the mark on a coloured tile. It carries its own contrast.
- Don't use red or green for anything that is not a verdict — not links, not
  buttons, not hovers. The moment green means "brand colour" it stops meaning
  "passed".
- Don't animate the mark on a loop. It draws once, on load. It is an iteration
  that completed, not a spinner.
