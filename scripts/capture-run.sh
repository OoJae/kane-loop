#!/usr/bin/env bash
# Snapshot the current session's Kane event log into evidence/ under a given name.
#
# The orchestrator broadcasts agent events but never persists them, and the Kane
# channel only lives in the append-only log until the next demo-reset. This is
# how a run becomes a committed artifact — the replay data, the README numbers
# and the screenshots all come from snapshots taken with this.
#
# Pair it with a `tee` of the agent stream to get both channels of one run:
#   claude -p "…" --output-format stream-json --verbose … | tee evidence/ui/<name>.stream.json
#   ./scripts/capture-run.sh <name>
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${1:-}"

if [ -z "$NAME" ]; then
  echo "usage: ./scripts/capture-run.sh <name>   # e.g. live-loop" >&2
  exit 1
fi
case "$NAME" in
  */*|..*) echo "name must be a bare filename" >&2; exit 1 ;;
esac

SRC="$ROOT/.kane-events.ndjson"
DEST_DIR="$ROOT/evidence/ui"
DEST="$DEST_DIR/${NAME}.events.ndjson"

if [ ! -s "$SRC" ]; then
  echo "✗ the event log is empty — run a loop first" >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
cp "$SRC" "$DEST"

# The hero image and the log it claims to depict drifted apart once already: the
# screenshot was frozen while this script silently overwrote live-loop.events.ndjson
# from a later run, so the README's "every number on screen is in it" became false.
# Warn when a capture lands next to an older image of the same name.
HERO="$DEST_DIR/${NAME}-hero.png"
if [ -f "$HERO" ] && [ "$HERO" -ot "$DEST" ]; then
  printf '\033[1;33m!\033[0m %s\n' "evidence/ui/${NAME}-hero.png is now OLDER than the log it depicts."
  printf '  Re-shoot it from ?replay=%s so every number on screen is in this file.\n' "$NAME"
fi

lines="$(wc -l <"$DEST" | tr -d ' ')"
verdicts="$(grep -c '"type":"flow_end"' "$DEST" || true)"
echo "✓ captured $lines lines ($verdicts verdicts) → evidence/ui/${NAME}.events.ndjson"
