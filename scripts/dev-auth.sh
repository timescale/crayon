#!/bin/bash
set -e

# Dev script: starts ngrok + local auth-server.
# The ngrok URL is injected as PUBLIC_URL so the create route
# sets OPFLOW_SERVER_URL on new Fly machines.
#
# Usage: ./scripts/dev-auth.sh
#
# Prerequisites:
#   - ngrok installed (brew install ngrok)
#   - docker compose up -d in packages/auth-server/
#   - .env.local configured in packages/auth-server/

NGROK_PID=""
cleanup() {
  echo ""
  echo "Shutting down..."
  if [ -n "$NGROK_PID" ]; then
    kill "$NGROK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# 1. Start ngrok in background
echo "Starting ngrok..."
ngrok http 3000 --log=stdout > /dev/null 2>&1 &
NGROK_PID=$!
sleep 2

# 2. Extract public URL from ngrok local API
PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | python3 -c "import sys,json; tunnels=json.load(sys.stdin)['tunnels']; print(next(t['public_url'] for t in tunnels if t['public_url'].startswith('https')))" 2>/dev/null)

if [ -z "$PUBLIC_URL" ]; then
  echo "ERROR: Failed to get ngrok URL. Is ngrok running?"
  exit 1
fi

echo ""
echo "==================================="
echo "  ngrok URL: $PUBLIC_URL"
echo "==================================="
echo ""
echo "To create a cloud workspace against this local server:"
echo "  OPFLOW_SERVER_URL=$PUBLIC_URL pnpm --filter 0pflow exec 0pflow cloud run"
echo ""

# 3. Start auth-server with PUBLIC_URL injected
cd "$(dirname "$0")/../packages/auth-server"
PUBLIC_URL="$PUBLIC_URL" pnpm dev
