#!/bin/bash
set -e

BOOT_START=$(date +%s%3N)
log() { echo "[$(( $(date +%s%3N) - BOOT_START ))ms] $*"; }

APP_DIR="/data/app"
APP_NAME="${APP_NAME:-my-app}"
DEV_USER="${DEV_USER:?DEV_USER must be set}"  # e.g., user-abc123
OPFLOW="$(npm prefix -g)/bin/0pflow"  # globally installed binary

# ── Create isolated Linux user ──────────────────────────────────
log "Creating user $DEV_USER..."
groupadd -f devs
if ! id "$DEV_USER" &>/dev/null; then
  useradd -m -s /bin/bash -g devs "$DEV_USER"
fi
DEV_HOME=$(eval echo "~$DEV_USER")

# ── Set up Claude Code config + credentials in user's home ────
log "Setting up credentials..."
mkdir -p "$DEV_HOME/.claude"

# Write OAuth credentials file if provided (skip if already exists — may have refreshed tokens)
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ] && [ ! -f "$DEV_HOME/.claude/.credentials.json" ]; then
  printf '%s' "$CLAUDE_OAUTH_CREDENTIALS" > "$DEV_HOME/.claude/.credentials.json"
  log "  Wrote OAuth credentials ($(wc -c < "$DEV_HOME/.claude/.credentials.json") bytes)"
elif [ -f "$DEV_HOME/.claude/.credentials.json" ]; then
  log "  OAuth credentials already exist, skipping"
fi

# Write .claude.json on first boot only — Claude Code may update it at runtime
if [ ! -f "$DEV_HOME/.claude.json" ]; then
  API_KEY_FIELD=""
  if [ -n "$CLAUDE_API_KEY" ]; then
    API_KEY_FIELD="\"primaryApiKey\": \"$CLAUDE_API_KEY\","
    log "  Including API key in config"
  fi
  cat > "$DEV_HOME/.claude.json" <<CJSON
{
  $API_KEY_FIELD
  "numStartups": 1,
  "installMethod": "npm",
  "autoUpdates": false,
  "hasCompletedOnboarding": true,
  "effortCalloutDismissed": true,
  "bypassPermissionsModeAccepted": true,
  "projects": {
    "$APP_DIR": {
      "allowedTools": [],
      "mcpContextUris": [],
      "mcpServers": {},
      "enabledMcpjsonServers": [],
      "disabledMcpjsonServers": [],
      "hasTrustDialogAccepted": true
    }
  }
}
CJSON
  log "  Wrote .claude.json config"
else
  log "  .claude.json already exists, skipping"
fi

if [ -z "$CLAUDE_OAUTH_CREDENTIALS" ] && [ -z "$CLAUDE_API_KEY" ]; then
  log "  WARNING: No Claude credentials found (CLAUDE_OAUTH_CREDENTIALS / CLAUDE_API_KEY not set)"
fi

chown -R "$DEV_USER:devs" "$DEV_HOME"

# ── Scaffold project on volume (first boot only) ───────────────
# Run as DEV_USER so all files are created with correct ownership (no chown needed).
if [ ! -f "$APP_DIR/package.json" ]; then
  log "Scaffolding new project: $APP_NAME"
  install -d -o "$DEV_USER" -g devs "$APP_DIR"
  log "  Running 0pflow init..."
  su -s /bin/bash "$DEV_USER" -c "cd '$APP_DIR' && "$OPFLOW" init '$APP_NAME' --dir . --no-install"
  log "  Scaffold complete (base node_modules at /node_modules via parent resolution)"
fi

# ── Verify ownership (disabled — slow on large trees, enable for debugging) ──
# BAD_FILES=$(find "$APP_DIR" -not -user "$DEV_USER" -o -not -group devs 2>/dev/null | head -20)
# if [ -n "$BAD_FILES" ]; then
#   log "WARNING: Files with wrong ownership:"
#   echo "$BAD_FILES"
# fi

# ── Register 0pflow Claude Code plugin for DEV_USER ────────────
log "Installing 0pflow plugin for $DEV_USER..."
su -s /bin/bash "$DEV_USER" -c "HOME='$DEV_HOME' "$OPFLOW" install" 2>/dev/null || true

# ── Start dev server as the user ────────────────────────────────
log "Starting dev server..."
cd "$APP_DIR"
export HOME="$(eval echo "~$DEV_USER")"
exec su -s /bin/bash --preserve-environment "$DEV_USER" -c ""$OPFLOW" dev --host --dangerously-skip-permissions"
