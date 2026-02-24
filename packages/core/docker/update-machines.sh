#!/bin/bash
# Update all Fly machines in a cloud-dev app to the latest image.
# Usage: ./update-machines.sh <fly-app-name> [image]
#   fly-app-name: e.g. opflow-dev-f7a3b2c1
#   image:        defaults to registry.fly.io/opflow-cloud-dev-image:latest
set -e

APP="${1:?Usage: $0 <fly-app-name> [image]}"
IMAGE="${2:-registry.fly.io/opflow-cloud-dev-image:latest}"

echo "==> Fetching machines for app: $APP"
MACHINES=$(flyctl machines list -a "$APP" --json 2>/dev/null)

IDS=$(echo "$MACHINES" | python3 -c "
import json, sys
machines = json.load(sys.stdin)
for m in machines:
    print(m['id'])
")

COUNT=$(echo "$IDS" | grep -c . || true)

if [ -z "$IDS" ] || [ "$COUNT" -eq 0 ]; then
  echo "No machines found in app $APP"
  exit 0
fi

echo "==> Found $COUNT machine(s). Updating to: $IMAGE"

for ID in $IDS; do
  echo "  Updating machine $ID..."
  flyctl machine update "$ID" --image "$IMAGE" -a "$APP" --yes
  echo "  Done: $ID"
done

echo "==> All machines updated."
