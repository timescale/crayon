#!/bin/bash
set -e

BOOT_START=$(date +%s%3N)
log() { echo "[$(( $(date +%s%3N) - BOOT_START ))ms] $*"; }

APP_DIR="/data/app"
APP_NAME="${APP_NAME:-my-app}"
DEV_USER="${DEV_USER:?DEV_USER must be set}"  # e.g., user-abc123

# ── Create isolated Linux user ──────────────────────────────────
log "Creating user $DEV_USER..."
groupadd -f devs
if ! id "$DEV_USER" &>/dev/null; then
  useradd -m -s /bin/bash -g devs "$DEV_USER"
fi
DEV_HOME=$(eval echo "~$DEV_USER")

# ── Set up Claude Code credentials in user's home ──────────────
log "Setting up credentials..."
mkdir -p "$DEV_HOME/.claude"
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
  echo "$CLAUDE_OAUTH_CREDENTIALS" > "$DEV_HOME/.claude/.credentials.json"
elif [ -n "$CLAUDE_API_KEY" ]; then
  echo "{\"primaryApiKey\":\"$CLAUDE_API_KEY\"}" > "$DEV_HOME/.claude.json"
fi
chown -R "$DEV_USER:devs" "$DEV_HOME"

# ── Scaffold project on volume (first boot only) ───────────────
# Run as DEV_USER so all files are created with correct ownership (no chown needed).
if [ ! -f "$APP_DIR/package.json" ]; then
  log "Scaffolding new project: $APP_NAME"
  install -d -o "$DEV_USER" -g devs "$APP_DIR"
  log "  Running 0pflow init..."
  su -s /bin/bash "$DEV_USER" -c "cd '$APP_DIR' && npx 0pflow init '$APP_NAME' --dir . --no-install"
  log "  Copying cached node_modules..."
  rsync -a --chown="$DEV_USER:devs" /cache/node_modules "$APP_DIR/"
  log "  Initializing git..."
  su -s /bin/bash "$DEV_USER" -c "cd '$APP_DIR' && git init && git add -A && git commit -m 'Initial scaffold'" 2>/dev/null || true
  log "  Scaffold complete"
fi

# Always sync 0pflow from the image (picks up new versions on image update).
# --chown sets correct ownership directly, no separate chown pass needed.
log "Syncing 0pflow from image..."
GLOBAL_OPFLOW="$(npm root -g)/0pflow"
rsync -a --delete --exclude node_modules --chown="$DEV_USER:devs" "$GLOBAL_OPFLOW/" "$APP_DIR/node_modules/0pflow/"
log "Sync complete"

# ── Verify ownership (disabled — slow on large trees, enable for debugging) ──
# BAD_FILES=$(find "$APP_DIR" -not -user "$DEV_USER" -o -not -group devs 2>/dev/null | head -20)
# if [ -n "$BAD_FILES" ]; then
#   log "WARNING: Files with wrong ownership:"
#   echo "$BAD_FILES"
# fi

# ── Start dev server as the user ────────────────────────────────
log "Starting dev server..."
cd "$APP_DIR"
export HOME="$(eval echo "~$DEV_USER")"
exec su -s /bin/bash --preserve-environment "$DEV_USER" -c "npx 0pflow dev --host --dangerously-skip-permissions"
