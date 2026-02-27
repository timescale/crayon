#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
AUTH_ENV="$SCRIPT_DIR/../../auth-server/.env.local"
REGISTRY="registry.fly.io/crayon-cloud-dev-image"
EXTRA_FLAGS=""

# Parse options
while [ $# -gt 0 ]; do
  case "$1" in
    --no-depot) EXTRA_FLAGS="$EXTRA_FLAGS --depot=false"; shift ;;
    *) TAG="$1"; shift ;;
  esac
done

# Use provided tag, or "latest" on main, or git-branch-based tag otherwise
if [ -n "$TAG" ]; then
  :
elif [ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null)" = "main" ]; then
  TAG="latest"
else
  TAG="$(git rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/[^a-zA-Z0-9._-]/-/g')"
fi

echo "==> Building crayon..."
pnpm --filter runcrayon build

echo "==> Packing tarball..."
cd "$CORE_DIR"
rm -f docker/runcrayon-*.tgz
npm pack --pack-destination docker/

echo "==> Building and pushing Docker image (tag: $TAG)..."
cd "$SCRIPT_DIR"
flyctl deploy --build-only --push --image-label "$TAG" --build-arg CRAYON_SOURCE=local $EXTRA_FLAGS

IMAGE="$REGISTRY:$TAG"
echo "==> Updating CLOUD_DEV_IMAGE in $AUTH_ENV"
if [ -f "$AUTH_ENV" ] && grep -q '^CLOUD_DEV_IMAGE=' "$AUTH_ENV"; then
  sed -i '' "s|^CLOUD_DEV_IMAGE=.*|CLOUD_DEV_IMAGE=$IMAGE|" "$AUTH_ENV"
else
  echo "CLOUD_DEV_IMAGE=$IMAGE" >> "$AUTH_ENV"
fi

echo "==> Done! Image: $IMAGE"
