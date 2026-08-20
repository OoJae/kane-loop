#!/usr/bin/env bash
# Re-seed the demo bug and clear loop state, so every rehearsal starts identical.
#
# Restores target-app/src to its committed state (the seeded, non-persisting
# dark mode toggle), truncates the event log, and clears lock/counter files.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "→ restoring target-app/src to the seeded (buggy) state"
git checkout -- target-app/src

echo "→ clearing loop state"
: >"$ROOT/.kane-events.ndjson"
rm -rf "$ROOT/.kane.lock"
rm -f "$ROOT/.kane-failcount" "$ROOT/.kane-stderr.log"

# Tests are immutable ground truth to the demo agent. Re-assert that after any
# rehearsal, in case a run left them writable.
if compgen -G "$ROOT/tests/*_test.md" >/dev/null; then
  chmod -w "$ROOT"/tests/*_test.md
fi

echo
echo "✓ demo reset. The dark mode bug is back:"
grep -n "useState(false)" target-app/src/App.tsx || true
echo
echo "  Dev server: ./scripts/dev.sh    (or cd target-app && npm run dev)"
