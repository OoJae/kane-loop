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

lines="$(wc -l <"$DEST" | tr -d ' ')"
verdicts="$(grep -c '"type":"flow_end"' "$DEST" || true)"
echo "✓ captured $lines lines ($verdicts verdicts) → evidence/ui/${NAME}.events.ndjson"
