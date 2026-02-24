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

  # Symlink base packages into /data/app/node_modules (one-time, persists on volume).
  # npm sees symlinks as installed packages — subsequent `npm install <pkg>` only writes
  # the new package. Uninstalls remove symlinks and they stay gone (not recreated on boot).
  # Upgrades: npm replaces symlinks with real dirs as needed.
  log "  Symlinking base packages..."
  mkdir -p "$APP_DIR/node_modules/.bin"
  for pkg in /node_modules/*; do
    name="$(basename "$pkg")"
    [[ "$name" == .* ]] && continue  # skip .bin, .package-lock.json, .cache, etc.
    if [[ "$name" == @* ]] && [ -d "$pkg" ]; then
      # Scoped package dir (e.g. @scope) — link individual packages so npm can
      # still add new packages under the same scope without hitting a symlink.
      mkdir -p "$APP_DIR/node_modules/$name"
      for scoped in "$pkg"/*; do
        sname="$(basename "$scoped")"
        [ ! -e "$APP_DIR/node_modules/$name/$sname" ] && \
          ln -s "$scoped" "$APP_DIR/node_modules/$name/$sname"
      done
    else
      [ ! -e "$APP_DIR/node_modules/$name" ] && \
        ln -s "$pkg" "$APP_DIR/node_modules/$name"
    fi
  done
  # Symlink .bin entries so npm scripts work without a local install
  for cmd in /node_modules/.bin/*; do
    cname="$(basename "$cmd")"
    [ ! -e "$APP_DIR/node_modules/.bin/$cname" ] && \
      ln -s "$cmd" "$APP_DIR/node_modules/.bin/$cname"
  done
  chown -R "$DEV_USER:devs" "$APP_DIR/node_modules"
  log "  Scaffold complete"
fi

# ── Verify ownership (disabled — slow on large trees, enable for debugging) ──
# BAD_FILES=$(find "$APP_DIR" -not -user "$DEV_USER" -o -not -group devs 2>/dev/null | head -20)
# if [ -n "$BAD_FILES" ]; then
#   log "WARNING: Files with wrong ownership:"
#   echo "$BAD_FILES"
# fi

# ── Pin /data/app/node_modules/0pflow → image version (every boot) ────────
# Ensures the app always uses the 0pflow binary baked into the image,
# even if the user ran `npm install` which would have written a stale registry copy.
mkdir -p "$APP_DIR/node_modules"
ln -sfn /node_modules/0pflow "$APP_DIR/node_modules/0pflow"
chown -h "$DEV_USER:devs" "$APP_DIR/node_modules" "$APP_DIR/node_modules/0pflow" 2>/dev/null || true

# ── Complete Claude Code native installer migration (suppresses startup prompt) ──
log "Completing Claude Code native install for $DEV_USER..."
su -s /bin/bash "$DEV_USER" -c "HOME='$DEV_HOME' claude install" 2>/dev/null || true

# ── Register 0pflow Claude Code plugin for DEV_USER ────────────
log "Installing 0pflow plugin for $DEV_USER..."
su -s /bin/bash "$DEV_USER" -c "HOME='$DEV_HOME' "$OPFLOW" install" 2>/dev/null || true

# ── Start dev server as the user ────────────────────────────────
log "Starting dev server..."
cd "$APP_DIR"
export HOME="$(eval echo "~$DEV_USER")"
export PATH="$DEV_HOME/.local/bin:$PATH"
exec su -s /bin/bash --preserve-environment "$DEV_USER" -c ""$OPFLOW" dev --host --dangerously-skip-permissions"
