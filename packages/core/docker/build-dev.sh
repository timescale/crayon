#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AUTH_ENV="$SCRIPT_DIR/../../auth-server/.env.local"
REGISTRY="registry.fly.io/opflow-cloud-dev-image"

# Use provided tag or default to git-branch-based tag
TAG="${1:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')}"

echo "==> Building 0pflow..."
pnpm --filter 0pflow build

echo "==> Packing tarball..."
cd "$CORE_DIR"
rm -f docker/0pflow-*.tgz
npm pack --pack-destination docker/

echo "==> Building and pushing Docker image (tag: $TAG)..."
cd "$SCRIPT_DIR"
flyctl deploy --build-only --push --image-label "$TAG" --build-arg OPFLOW_SOURCE=local

IMAGE="$REGISTRY:$TAG"
echo "==> Updating CLOUD_DEV_IMAGE in $AUTH_ENV"
if [ -f "$AUTH_ENV" ] && grep -q '^CLOUD_DEV_IMAGE=' "$AUTH_ENV"; then
  sed -i '' "s|^CLOUD_DEV_IMAGE=.*|CLOUD_DEV_IMAGE=$IMAGE|" "$AUTH_ENV"
else
  echo "CLOUD_DEV_IMAGE=$IMAGE" >> "$AUTH_ENV"
fi

echo "==> Done! Image: $IMAGE"
