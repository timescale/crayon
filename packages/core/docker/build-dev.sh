#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CORE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "==> Building 0pflow..."
pnpm --filter 0pflow build

echo "==> Packing tarball..."
cd "$CORE_DIR"
rm -f docker/0pflow-*.tgz
npm pack --pack-destination docker/

echo "==> Building and pushing Docker image..."
cd "$SCRIPT_DIR"
flyctl deploy --build-only --push --image-label latest --build-arg OPFLOW_SOURCE=local

echo "==> Done! Image pushed to registry.fly.io/opflow-cloud-dev-image:latest"
