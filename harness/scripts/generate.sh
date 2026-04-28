#!/usr/bin/env bash
# Run a configured CLI in YOLO non-interactive mode to generate a candidate repo
# from the fixture. Captures wall-clock time and stdout/stderr.
#
# Usage: generate.sh <generator-name> <run-id> <harness-dir>
#   generator-name   matches a candidate_generators[].name in config.yaml
#   run-id           runs/<run-id>/candidate/ will be the output worktree
#   harness-dir      path to the harness/ directory
#
# The generator config is consumed via a small Python helper that reads
# config.yaml and prints the resolved cmd to stdout, so this script stays
# pure bash.

set -uo pipefail

# --dry-run prints the resolved cmd + paths without executing the CLI.
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=1
  shift
fi

GENERATOR="${1:?usage: generate.sh [--dry-run] GENERATOR RUN_ID HARNESS_DIR}"
RUN_ID="${2:?usage: generate.sh [--dry-run] GENERATOR RUN_ID HARNESS_DIR}"
HARNESS_DIR="${3:?usage: generate.sh [--dry-run] GENERATOR RUN_ID HARNESS_DIR}"

REPO_ROOT="$(cd "$HARNESS_DIR/.." && pwd)"
RUN_DIR="$HARNESS_DIR/runs/$RUN_ID"
CANDIDATE_DIR="$RUN_DIR/candidate"
META_DIR="$RUN_DIR/_generation"

mkdir -p "$CANDIDATE_DIR" "$META_DIR"

# Build the prompt: concat the four fixture files in order.
PROMPT_FILE="$META_DIR/prompt.md"
{
  cat "$REPO_ROOT/fixture/START-HERE.md"
  echo -e "\n\n---\n\n"
  cat "$REPO_ROOT/fixture/REQUIREMENTS.md"
  echo -e "\n\n---\n\n"
  cat "$REPO_ROOT/fixture/TECH-CONSTRAINTS.md"
  echo -e "\n\n---\n\n"
  cat "$REPO_ROOT/fixture/TASKS.md"
} > "$PROMPT_FILE"

# Resolve the cmd template + prompt_input + timeout via a small inline Python
# helper that reads config.yaml. Output format: one value per line —
#   line 1: prompt_input (string)
#   line 2: timeout_seconds (int)
#   line 3+: each cmd argument, one per line (terminated by a marker line "==END==")
RESOLVE_OUT="$META_DIR/_resolve.txt"
python3 - "$HARNESS_DIR/config.yaml" "$GENERATOR" "$CANDIDATE_DIR" "$REPO_ROOT/fixture" "$PROMPT_FILE" "$HARNESS_DIR" > "$RESOLVE_OUT" <<'PY'
import sys, yaml
cfg_path, name, candidate_dir, fixture_dir, prompt_file, harness_dir = sys.argv[1:7]
cfg = yaml.safe_load(open(cfg_path))
gens = {g["name"]: g for g in cfg["candidate_generators"]}
if name not in gens:
    sys.exit(f"ERROR: generator '{name}' not in config.yaml")
g = gens[name]
subs = {
    "${CANDIDATE_DIR}": candidate_dir,
    "${FIXTURE_DIR}":   fixture_dir,
    "${PROMPT_FILE}":   prompt_file,
    "${HARNESS_DIR}":   harness_dir,
}
print(g.get("prompt_input", "stdin"))
print(int(g.get("timeout_seconds", 3600)))
for arg in g["cmd"]:
    for k, v in subs.items():
        arg = arg.replace(k, v)
    print(arg)
print("==END==")
PY

if [ ! -s "$RESOLVE_OUT" ]; then
  echo "ERROR: failed to resolve generator config" >&2
  exit 2
fi

# Read prompt_input from line 1, timeout from line 2, cmd from lines 3..==END==
PROMPT_INPUT=$(sed -n '1p' "$RESOLVE_OUT")
TIMEOUT=$(sed -n '2p' "$RESOLVE_OUT")
mapfile -t CMD < <(sed -n '3,$p' "$RESOLVE_OUT" | sed '/^==END==$/d')

# Record what we are about to run
{
  echo "generator: $GENERATOR"
  echo "run_id:    $RUN_ID"
  echo "started:   $(date -Iseconds)"
  echo "cmd:       ${CMD[*]}"
  echo "prompt_input: $PROMPT_INPUT"
  echo "timeout:   ${TIMEOUT}s"
} > "$META_DIR/manifest.txt"

if [ "$DRY_RUN" = "1" ]; then
  echo "[generate] DRY RUN — would execute:"
  printf '  '
  for a in "${CMD[@]}"; do printf '%q ' "$a"; done
  echo
  echo "[generate]   prompt_input: $PROMPT_INPUT"
  echo "[generate]   prompt_file:  $PROMPT_FILE  ($(wc -c < "$PROMPT_FILE") bytes)"
  echo "[generate]   candidate:    $CANDIDATE_DIR"
  echo "[generate]   timeout:      ${TIMEOUT}s"
  exit 0
fi

START=$(date +%s)

case "$PROMPT_INPUT" in
  stdin)
    timeout "${TIMEOUT}s" "${CMD[@]}" \
      < "$PROMPT_FILE" \
      > "$META_DIR/stdout.log" 2> "$META_DIR/stderr.log"
    ;;
  arg)
    timeout "${TIMEOUT}s" "${CMD[@]}" "$(cat "$PROMPT_FILE")" \
      > "$META_DIR/stdout.log" 2> "$META_DIR/stderr.log"
    ;;
  filearg)
    timeout "${TIMEOUT}s" "${CMD[@]}" "@$PROMPT_FILE" \
      > "$META_DIR/stdout.log" 2> "$META_DIR/stderr.log"
    ;;
  *)
    echo "ERROR: unknown prompt_input '$PROMPT_INPUT'" >&2
    exit 2
    ;;
esac
RC=$?

END=$(date +%s)
echo "exit_code: $RC"      >> "$META_DIR/manifest.txt"
echo "ended:     $(date -Iseconds)" >> "$META_DIR/manifest.txt"
echo "wall_seconds: $((END - START))" >> "$META_DIR/manifest.txt"

if [ $RC -ne 0 ]; then
  echo "[generate] CLI exited $RC (timeout or error). See $META_DIR/stderr.log"
  echo "[generate] candidate may be incomplete; gauntlet will reflect that"
fi

echo "[generate] candidate at $CANDIDATE_DIR"
echo "[generate] generation log at $META_DIR/"
exit 0
