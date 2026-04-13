#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROMPT_FILE="$REPO_ROOT/.codex/prompts/local-review.md"
REPORT_DIR="$REPO_ROOT/.codex/reports/local-review"
BASE_BRANCH="${ASSISTSUPPORT_REVIEW_BASE:-origin/main}"
REVIEW_UNCOMMITTED=0
REVIEW_EFFORT="${ASSISTSUPPORT_REVIEW_EFFORT:-low}"
REVIEW_PROFILE="${ASSISTSUPPORT_REVIEW_PROFILE:-coding}"
REVIEW_MODEL="${ASSISTSUPPORT_REVIEW_MODEL:-}"
REVIEW_TIMEOUT_SECS="${ASSISTSUPPORT_REVIEW_TIMEOUT_SECS:-}"

discover_changed_file_count() {
  if [[ "$REVIEW_UNCOMMITTED" -eq 1 ]]; then
    {
      git diff --name-only --cached
      git diff --name-only
      git ls-files --others --exclude-standard
    } | sed '/^$/d' | sort -u | wc -l | tr -d ' '
    return
  fi

  git diff --name-only "$BASE_BRANCH"...HEAD | sed '/^$/d' | wc -l | tr -d ' '
}

discover_shortstat() {
  if [[ "$REVIEW_UNCOMMITTED" -eq 1 ]]; then
    {
      git diff --shortstat --cached
      git diff --shortstat
    } | sed '/^$/d' | paste -sd '; ' -
    return
  fi

  git diff --shortstat "$BASE_BRANCH"...HEAD
}

resolve_timeout_secs() {
  local changed_files="$1"
  if [[ -n "$REVIEW_TIMEOUT_SECS" ]]; then
    printf '%s\n' "$REVIEW_TIMEOUT_SECS"
    return
  fi

  if (( changed_files >= 40 )); then
    printf '%s\n' "600"
  elif (( changed_files >= 25 )); then
    printf '%s\n' "420"
  elif (( changed_files >= 12 )); then
    printf '%s\n' "300"
  else
    printf '%s\n' "180"
  fi
}

resolve_review_model() {
  if [[ -n "$REVIEW_MODEL" ]]; then
    printf '%s\n' "$REVIEW_MODEL"
    return
  fi

  case "$REVIEW_PROFILE" in
    coding)
      printf '%s\n' "gpt-5-codex"
      ;;
    fast_review)
      printf '%s\n' "gpt-5-codex-mini"
      ;;
    *)
      printf '%s\n' ""
      ;;
  esac
}

usage() {
  cat <<'EOF'
Usage:
  scripts/git/run-codex-review.sh [--base origin/main]
  scripts/git/run-codex-review.sh --uncommitted [--base origin/main]

Notes:
  - Uses your local Codex login/session.
  - Does not require OPENAI_API_KEY repo secrets.
  - Default review base is origin/main unless ASSISTSUPPORT_REVIEW_BASE is set.
  - Default review profile is coding unless ASSISTSUPPORT_REVIEW_PROFILE is set.
  - Optional model override via ASSISTSUPPORT_REVIEW_MODEL.
  - Default review effort is low unless ASSISTSUPPORT_REVIEW_EFFORT is set.
  - Default timeout is 180 seconds unless ASSISTSUPPORT_REVIEW_TIMEOUT_SECS is set.
  - Current codex-cli releases may reject custom prompts for `codex review`;
    this helper falls back to the built-in review flow when that happens.
  - Current codex-cli releases do not accept profile flags for `codex review`,
    so the helper maps coding -> gpt-5-codex and fast_review -> gpt-5-codex-mini.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base)
      BASE_BRANCH="${2:-}"
      if [[ -z "$BASE_BRANCH" ]]; then
        echo "Missing value for --base" >&2
        exit 1
      fi
      shift 2
      ;;
    --uncommitted)
      REVIEW_UNCOMMITTED=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI not found in PATH." >&2
  exit 1
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Missing review prompt file: $PROMPT_FILE" >&2
  exit 1
fi

cd "$REPO_ROOT"
mkdir -p "$REPORT_DIR"

RESOLVED_MODEL="$(resolve_review_model)"
CONFIG_ARGS=(-c "model_reasoning_effort=\"$REVIEW_EFFORT\"")
if [[ -n "$RESOLVED_MODEL" ]]; then
  CONFIG_ARGS+=(-c "model=\"$RESOLVED_MODEL\"")
fi

RUN_KEY="$(date +%Y%m%dT%H%M%S)"
STDOUT_LOG="$REPORT_DIR/review-$RUN_KEY.stdout.log"
STDERR_LOG="$REPORT_DIR/review-$RUN_KEY.stderr.log"
META_LOG="$REPORT_DIR/review-$RUN_KEY.meta.txt"
CHANGED_FILE_COUNT="$(discover_changed_file_count)"
SHORTSTAT="$(discover_shortstat)"
EFFECTIVE_TIMEOUT_SECS="$(resolve_timeout_secs "$CHANGED_FILE_COUNT")"
REVIEW_MODE="base"
if [[ "$REVIEW_UNCOMMITTED" -eq 1 ]]; then
  REVIEW_MODE="uncommitted"
fi

cat > "$META_LOG" <<EOF
profile=$REVIEW_PROFILE
resolved_model=$RESOLVED_MODEL
mode=$REVIEW_MODE
base_branch=$BASE_BRANCH
changed_files=$CHANGED_FILE_COUNT
shortstat=$SHORTSTAT
timeout_secs=$EFFECTIVE_TIMEOUT_SECS
stdout_log=$STDOUT_LOG
stderr_log=$STDERR_LOG
EOF

echo "Starting Codex review: profile=$REVIEW_PROFILE model=${RESOLVED_MODEL:-default} mode=$REVIEW_MODE changed_files=$CHANGED_FILE_COUNT timeout=${EFFECTIVE_TIMEOUT_SECS}s" >&2
if [[ -n "$SHORTSTAT" ]]; then
  echo "Diff summary: $SHORTSTAT" >&2
fi

REVIEW_CMD=(codex review "${CONFIG_ARGS[@]}")
if [[ "$REVIEW_UNCOMMITTED" -eq 1 ]]; then
  echo "codex review is using the built-in review flow because this CLI version rejects custom prompts for --uncommitted." >&2
  REVIEW_CMD+=(--title "$REVIEW_PROFILE review ($CHANGED_FILE_COUNT files)")
  REVIEW_CMD+=(--uncommitted)
else
  echo "codex review is using the built-in review flow because this CLI version rejects custom prompts for --base." >&2
  REVIEW_CMD+=(--title "$REVIEW_PROFILE review ($CHANGED_FILE_COUNT files)")
  REVIEW_CMD+=(--base "$BASE_BRANCH")
fi

python3 - <<'PY' "$EFFECTIVE_TIMEOUT_SECS" "$STDOUT_LOG" "$STDERR_LOG" "${REVIEW_CMD[@]}"
import pathlib
import subprocess
import sys

timeout = int(sys.argv[1])
stdout_log = pathlib.Path(sys.argv[2])
stderr_log = pathlib.Path(sys.argv[3])
cmd = sys.argv[4:]

NOISY_MARKERS = (
    "ignoring interface.defaultPrompt",
    "Failed to terminate MCP process group",
    "Transport channel closed",
    "falling back to base instructions",
)


def clean_stderr(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if any(marker in line for marker in NOISY_MARKERS):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def ensure_text(value):
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf8", errors="replace")
    return value


try:
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    stdout_log.write_text(proc.stdout, encoding="utf8")
    cleaned_stderr = clean_stderr(proc.stderr)
    stderr_log.write_text(cleaned_stderr + ("\n" if cleaned_stderr else ""), encoding="utf8")
    if proc.stdout:
        sys.stdout.write(proc.stdout)
    if cleaned_stderr:
        sys.stderr.write(cleaned_stderr + "\n")
    raise SystemExit(proc.returncode)
except subprocess.TimeoutExpired as exc:
    stdout = ensure_text(exc.stdout)
    stderr = clean_stderr(ensure_text(exc.stderr))
    stdout_log.write_text(stdout, encoding="utf8")
    stderr_log.write_text((stderr + "\n") if stderr else "", encoding="utf8")
    sys.stderr.write(
        f"codex review timed out after {timeout} seconds. "
        f"See logs at {stdout_log} and {stderr_log}.\n"
    )
    raise SystemExit(124)
PY
