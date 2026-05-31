#!/usr/bin/env bash
set -euo pipefail

branch="$(git rev-parse --abbrev-ref HEAD)"
pattern='^codex/(feat|fix|chore|refactor|docs|test|perf|ci|spike|hotfix)/[a-z0-9]+(-[a-z0-9]+)*$'

if [[ "$branch" == "HEAD" && "${CI:-}" == "true" ]]; then
  echo "Detached HEAD in CI checkout detected; skipping branch-name guard."
  exit 0
fi

if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  if [[ "${CI:-}" == "true" && "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "Default branch CI checkout detected; skipping branch-name guard."
    exit 0
  fi
  echo "Direct work on $branch is blocked."
  exit 1
fi

if [[ "$branch" == release-please--branches--* ]]; then
  echo "Release Please automation branch detected; skipping branch-name guard."
  exit 0
fi

if ! [[ "$branch" =~ $pattern ]]; then
  echo "Invalid branch name: $branch"
  echo "Expected: codex/<type>/<slug>"
  exit 1
fi
