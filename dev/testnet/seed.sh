#!/usr/bin/env bash
# Publishes data through router A's REST plugin, so the keyspace tree has
# something in it and the storages have values to answer queries with.
set -euo pipefail
REST="${ZENOH_REST:-http://localhost:8000}"

put() {
  curl -fsS -X PUT "$REST/$1" -H 'content-type: application/json' -d "$2" >/dev/null
  printf '  %s\n' "$1"
}

echo "Publishing to $REST"
for id in 07 11 14; do
  put "fleet/agv/$id/telemetry/pose" "{\"x\":1.2,\"y\":-3.4,\"yaw\":0.7}"
  put "fleet/agv/$id/telemetry/battery" "{\"percent\":78}"
  put "fleet/agv/$id/status" '"idle"'
done
put "fleet/config/limits" '{"max_speed":1.5}'
put "vision/mast-a/frames/meta" '{"fps":30}'
put "vision/mast-b/frames/meta" '{"fps":15}'
echo "Done. The keyspace tree should fill in without a refresh."
