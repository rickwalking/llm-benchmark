#!/usr/bin/env bash
# Wrap a `docker run` invocation for the harness, mounting the harness scripts
# as read-only and the runs/ tree as read-write. The candidate code never
# touches the host filesystem outside runs/.
#
# Usage:
#   docker-run.sh gauntlet  <run-id> <harness-dir> <image>
#   docker-run.sh boot-app  <run-id> <harness-dir> <image>   (detached, prints container id)
#   docker-run.sh stop      <container-id>
#
# Network model:
#   - Gauntlet: default bridge, no port publish (everything internal to container).
#   - Boot-app: -p 5173:5173 -p 3001:3001 so the host-side judge / Playwright MCP
#     can reach the candidate's dev server via localhost.

set -uo pipefail

MODE="${1:?usage: docker-run.sh MODE ...}"

case "$MODE" in
  gauntlet)
    RUN_ID="${2:?run-id required}"
    HARNESS_DIR="${3:?harness-dir required}"
    IMAGE="${4:?image required}"
    RUNS_DIR="$HARNESS_DIR/runs"
    [ -d "$RUNS_DIR/$RUN_ID/candidate" ] || { echo "ERROR: $RUNS_DIR/$RUN_ID/candidate missing" >&2; exit 2; }

    exec docker run --rm \
      --user "$(id -u):$(id -g)" \
      --network bridge \
      -v "$HARNESS_DIR:/harness:ro" \
      -v "$RUNS_DIR:/runs" \
      -v "$HOME/.npm-docker:/tmp/.npm" \
      -e HOME=/tmp \
      -w "/runs/$RUN_ID/candidate" \
      "$IMAGE" \
      /harness/scripts/run-objective.sh "/runs/$RUN_ID" /harness
    ;;

  boot-app)
    RUN_ID="${2:?run-id required}"
    HARNESS_DIR="${3:?harness-dir required}"
    IMAGE="${4:?image required}"
    RUNS_DIR="$HARNESS_DIR/runs"
    [ -d "$RUNS_DIR/$RUN_ID/candidate" ] || { echo "ERROR: $RUNS_DIR/$RUN_ID/candidate missing" >&2; exit 2; }

    # Detached. Caller captures container id from stdout.
    docker run -d --rm \
      --user "$(id -u):$(id -g)" \
      --network bridge \
      -v "$HARNESS_DIR:/harness:ro" \
      -v "$RUNS_DIR:/runs" \
      -v "$HOME/.npm-docker:/tmp/.npm" \
      -e HOME=/tmp \
      -p "127.0.0.1:5173:5173" \
      -p "127.0.0.1:3001:3001" \
      -w "/runs/$RUN_ID/candidate" \
      "$IMAGE" \
      -c 'npm run dev'
    ;;

  stop)
    CID="${2:?container-id required}"
    docker stop --time 5 "$CID" >/dev/null 2>&1 || true
    ;;

  *)
    echo "ERROR: unknown mode '$MODE' (gauntlet|boot-app|stop)" >&2
    exit 2
    ;;
esac
