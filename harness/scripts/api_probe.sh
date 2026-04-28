#!/usr/bin/env bash
# Hit each documented endpoint and record the actual HTTP status + first KB of body.
# Used by the API-design rubric to compare actual responses to the OpenAPI spec.
#
# Usage: api_probe.sh <output.json>
# Assumes the candidate app is already running on :3001.

set -uo pipefail

OUT="${1:?usage: api_probe.sh OUTPUT_PATH}"
BASE="http://localhost:3001"

probe() {
  local method="$1" path="$2" body="${3:-}"
  local code body_excerpt
  if [ -n "$body" ]; then
    code=$(curl -s -o /tmp/probe_body -w '%{http_code}' -X "$method" \
      -H 'Content-Type: application/json' -d "$body" "$BASE$path" || echo "000")
  else
    code=$(curl -s -o /tmp/probe_body -w '%{http_code}' -X "$method" "$BASE$path" || echo "000")
  fi
  body_excerpt=$(head -c 1024 /tmp/probe_body | jq -Rs . 2>/dev/null || echo '""')
  printf '  {"method":"%s","path":"%s","status":%s,"body":%s}' "$method" "$path" "$code" "$body_excerpt"
}

{
  echo "["
  probe GET  "/api/books"; echo ","
  probe GET  "/api/books/00000000-0000-0000-0000-000000000000"; echo ","   # AC-1.4: 404
  probe POST "/api/books" '{"title":"x","author":"y","isbn":"123","total_copies":1}'; echo ","
  probe POST "/api/books" '{}'; echo ","                                   # validation 400
  probe GET  "/api/members"; echo ","
  probe POST "/api/members" '{"name":"Test","email":"test@example.com"}'; echo ","
  probe GET  "/api/members/00000000-0000-0000-0000-000000000000"; echo ","
  probe POST "/api/loans"   '{"member_id":"x","book_id":"y"}'; echo ","
  probe POST "/api/reservations" '{"member_id":"x","book_id":"y"}'; echo ","
  probe POST "/api/reservations/expire"
  echo "]"
} > "$OUT"
