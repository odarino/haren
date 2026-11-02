#!/usr/bin/env bash
# Fails when staged changes contain terms from the private deny list.
# The deny list lives OUTSIDE the repo: $HAREN_SCRUB_TERMS (one regex per line).
set -euo pipefail
terms="${HAREN_SCRUB_TERMS:-$HOME/.config/haren/scrub-terms.txt}"
[ -f "$terms" ] || { echo "scrub: no deny list at $terms (skipped)"; exit 0; }
if git diff --cached -U0 | grep '^+' | grep -inE -f "$terms"; then
  echo "scrub: FAIL — remove client terms above"; exit 1
fi
echo "scrub: PASS"
