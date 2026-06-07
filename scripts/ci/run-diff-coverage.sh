#!/usr/bin/env bash
set -euo pipefail

# Ensure diff-cover is available before we invoke it. The quality-gates
# workflow historically installed it in a later step, which caused the
# verify-commands stage (where this script runs) to fail with
# ModuleNotFoundError on every PR. Keep the script self-sufficient without
# mutating externally managed Python installs such as Homebrew's.
diff_cover_python="${DIFF_COVER_PYTHON:-python3}"
if ! "$diff_cover_python" -c "import diff_cover" >/dev/null 2>&1; then
  cache_root="${XDG_CACHE_HOME:-${HOME:-$PWD}/.cache}"
  venv_dir="${DIFF_COVER_VENV:-$cache_root/assistsupport/diff-cover-venv}"
  python3 -m venv "$venv_dir"
  "$venv_dir/bin/python" -m pip install --quiet --disable-pip-version-check diff-cover
  diff_cover_python="$venv_dir/bin/python"
fi

base_ref="${GITHUB_BASE_REF:-}"
if [[ -n "$base_ref" ]]; then
  compare_branch="origin/${base_ref}"
else
  compare_branch="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/@@')"
  compare_branch="${compare_branch:-origin/master}"
fi

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
github_ref_name="${GITHUB_REF_NAME:-}"
github_ref="${GITHUB_REF:-}"
compare_ref="${compare_branch#origin/}"
head_sha="$(git rev-parse HEAD 2>/dev/null || true)"
compare_sha="$(git rev-parse "$compare_branch" 2>/dev/null || true)"
is_default_branch_run=false
if [[ "$current_branch" == "$compare_ref" || "$github_ref_name" == "$compare_ref" || "$github_ref" == "refs/heads/$compare_ref" ]]; then
  is_default_branch_run=true
elif [[ -n "$head_sha" && "$head_sha" == "$compare_sha" ]]; then
  is_default_branch_run=true
fi

if [[ -z "$base_ref" && "$is_default_branch_run" == "true" ]]; then
  echo "Default branch coverage run detected; skipping diff coverage."
  exit 0
fi

coverage_file="coverage/frontend/lcov.info"
if [[ ! -f "$coverage_file" ]]; then
  echo "missing coverage file: $coverage_file" >&2
  exit 1
fi

"$diff_cover_python" -m diff_cover.diff_cover_tool "$coverage_file" \
  --compare-branch="$compare_branch" \
  --fail-under=90 \
  --include "src/**/*.ts" "src/**/*.tsx" \
  --exclude "*.test.ts" "*.test.tsx" "*.spec.ts" "*.spec.tsx" "*/src/test/*"
