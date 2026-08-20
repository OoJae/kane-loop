# Kane Loop

**Watch an AI agent fix its own bug — with eyes.**

A local prompt-to-feature playground where the agent development loop closes itself, visibly: you type a feature request, Claude Code edits a small web app, a PostToolUse hook fires Kane CLI (real Chrome) the instant a file is saved, Kane's failure is injected straight back into the agent's context so it fixes itself, and a Stop-hook gate means the agent literally cannot say "done" while Kane is red.

> 🚧 Built live for the Kane CLI Online Hackathon (TestMu AI, Aug 19–21, 2026). Quickstart, architecture, and evidence links land here as the build progresses — the commit history narrates the build.

## Docs

- [`docs/kane-loop-build-guide.md`](docs/kane-loop-build-guide.md) — the authoritative build spec
- [`docs/kane-loop-winning-strategy.md`](docs/kane-loop-winning-strategy.md) — the research behind the idea
- [`docs/tool-surface.md`](docs/tool-surface.md) — verified tool surfaces (Phase 0 output)
