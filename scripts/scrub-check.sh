#!/usr/bin/env bash
# Fails when staged changes contain terms from the private deny list.
# The deny list lives OUTSIDE the repo: $HAREN_SCRUB_TERMS (one regex per line).
# Fails closed: an invalid regex exits 2. Blank lines in the list are ignored.
# A missing or empty deny list warns on stderr; it exits 1 when $CI is set.
set -euo pipefail
terms="${HAREN_SCRUB_TERMS:-$HOME/.config/haren/scrub-terms.txt}"
no_list() {
  echo "scrub: WARNING — no deny list, nothing checked ($terms)" >&2
  if [ -n "${CI:-}" ]; then exit 1; fi
  exit 0
}
[ -f "$terms" ] || no_list
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
grep -v '^[[:space:]]*$' "$terms" > "$tmp" || true
[ -s "$tmp" ] || no_list
# Added content lines only: skip the +++ file header.
added="$(git diff --cached -U0 | grep -E '^\+' | grep -vE '^\+\+\+ ' || true)"
mrc=0
matches="$(printf '%s\n' "$added" | grep -inE -f "$tmp")" || mrc=$?
if [ "$mrc" -eq 2 ]; then echo "scrub: invalid deny list at $terms"; exit 2; fi
if [ "$mrc" -eq 0 ]; then
  echo "$matches"
  echo "scrub: FAIL — remove client terms above"; exit 1
fi
echo "scrub: PASS"
