#!/usr/bin/env bash
# Re-seed the demo bug and clear loop state, so every rehearsal starts identical.
#
# Restores target-app/src to its committed state (the seeded, non-persisting
# dark mode toggle), truncates the event log, and clears lock/counter files.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "→ restoring target-app/src to the seeded (buggy) state"
# Restore from the pristine seed, NOT from git HEAD. A `git checkout` here is
# only correct while HEAD happens to hold the buggy version — and a stray
# `git add -A` after a successful loop run silently commits the agent's fix,
# after which the "reset" would restore the FIX and the demo would open green.
# That happened once. The seed file is the source of truth now.
cp "$ROOT/target-app/.seed/App.tsx" "$ROOT/target-app/src/App.tsx"

if grep -q localStorage "$ROOT/target-app/src/App.tsx"; then
  echo "✗ ABORT: seed copy is not the buggy version — dark mode would already persist." >&2
  exit 1
fi

# Any other stray edits the agent made under src/ still come from git.
git checkout -- target-app/src/index.css target-app/src/main.tsx 2>/dev/null || true

echo "→ un-staging the generalization flow (demo beat 2 re-stages it)"
if [ -f "$ROOT/tests/formvalidation_test.md" ]; then
  mkdir -p "$ROOT/tests/pending"
  chmod +w "$ROOT/tests/formvalidation_test.md"
  mv "$ROOT/tests/formvalidation_test.md" "$ROOT/tests/pending/"
  [ -d "$ROOT/tests/output-formvalidation" ] && mv "$ROOT/tests/output-formvalidation" "$ROOT/tests/pending/"
fi

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
