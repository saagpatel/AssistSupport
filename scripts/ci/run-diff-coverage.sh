#!/usr/bin/env bash
set -euo pipefail

# Ensure diff-cover is available before we invoke it. The quality-gates
# workflow historically installed it in a later step, which caused the
# verify-commands stage (where this script runs) to fail with
# ModuleNotFoundError on every PR. Make the script self-sufficient so it
# works whether called from CI, local dev, or a fresh container.
if ! python3 -c "import diff_cover" >/dev/null 2>&1; then
  python3 -m pip install --quiet --disable-pip-version-check diff-cover
fi

base_ref="${GITHUB_BASE_REF:-}"
if [[ -n "$base_ref" ]]; then
  compare_branch="origin/${base_ref}"
else
  compare_branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/@@')"
  compare_branch="${compare_branch:-origin/master}"
fi

coverage_file="coverage/frontend/lcov.info"
if [[ ! -f "$coverage_file" ]]; then
  echo "missing coverage file: $coverage_file" >&2
  exit 1
fi

python3 -m diff_cover.diff_cover_tool "$coverage_file" \
  --compare-branch="$compare_branch" \
  --fail-under=90 \
  --include "src/**/*.ts" "src/**/*.tsx" \
  --exclude "src/**/*.test.ts" "src/**/*.test.tsx" "src/**/*.spec.ts" "src/**/*.spec.tsx"
