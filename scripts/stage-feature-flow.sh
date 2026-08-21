#!/usr/bin/env bash
# Demo beat 2 — "it generalizes".
#
# Moves the pre-authored form-validation flow into tests/, where the hooks pick
# it up automatically on the very next save. Nothing else changes: the same
# PostToolUse hook, the same Stop gate, a feature they have never seen.
#
# The flow was authored against a working implementation and then the feature
# was reverted, so it goes RED until the agent builds it — same honest pattern
# as the seeded dark mode bug.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/tests/pending"
DST="$ROOT/tests"

if [ ! -f "$SRC/formvalidation_test.md" ]; then
  echo "✓ formvalidation_test.md is already staged in tests/"
  exit 0
fi

mv "$SRC/formvalidation_test.md" "$DST/"
[ -d "$SRC/output-formvalidation" ] && mv "$SRC/output-formvalidation" "$DST/"
chmod -w "$DST/formvalidation_test.md"

# Staging a flow legitimately changes the oracle set, so the old seal is now
# stale. Drop it; the next verified save re-seals over the new, correct set.
rm -f "$ROOT/.kane-oracle.sha256"

echo "✓ staged: tests/formvalidation_test.md (cached, read-only)"
echo
echo "  The hooks now run BOTH flows. Ask the agent for the feature, e.g."
echo '    "disable the Add note button until the note has text"'
