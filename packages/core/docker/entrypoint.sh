#!/bin/bash
set -e

BOOT_START=$(date +%s%3N)
log() { echo "[$(( $(date +%s%3N) - BOOT_START ))ms] $*"; }

APP_DIR="/data/app"
APP_NAME="${APP_NAME:-my-app}"
DEV_USER="${DEV_USER:?DEV_USER must be set}"  # e.g., user-abc123
CRAYON="$(npm prefix -g)/bin/crayon"  # globally installed binary

# ── Create isolated Linux user ──────────────────────────────────
log "Creating user $DEV_USER..."
groupadd -f devs
if ! id "$DEV_USER" &>/dev/null; then
  useradd -m -s /bin/bash -g devs "$DEV_USER"
fi
echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/$DEV_USER"
DEV_HOME=$(eval echo "~$DEV_USER")

# Fix up plugin paths — skel has __HOMEDIR__ placeholders from build time
for f in "$DEV_HOME/.claude/plugins/known_marketplaces.json" "$DEV_HOME/.claude/plugins/installed_plugins.json"; do
  [ -f "$f" ] && sed -i "s|__HOMEDIR__|$DEV_HOME|g" "$f"
done

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

# Merge required fields into .claude.json (skel provides plugin registrations;
# we overlay credentials, onboarding flags, and project trust on every boot).
log "Updating .claude.json..."
node -e "
  const fs = require('fs');
  const path = '$DEV_HOME/.claude.json';
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path, 'utf-8')); } catch {}
  const apiKey = process.env.CLAUDE_API_KEY || '';
  if (apiKey) cfg.primaryApiKey = apiKey;
  Object.assign(cfg, {
    hasCompletedOnboarding: true,
    effortCalloutDismissed: true,
    bypassPermissionsModeAccepted: true,
  });
  cfg.projects = cfg.projects || {};
  cfg.projects['$APP_DIR'] = Object.assign(cfg.projects['$APP_DIR'] || {}, {
    allowedTools: [],
    mcpContextUris: [],
    mcpServers: {},
    enabledMcpjsonServers: [],
    disabledMcpjsonServers: [],
    hasTrustDialogAccepted: true,
  });
  fs.writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
"
log "  .claude.json updated"

if [ -z "$CLAUDE_OAUTH_CREDENTIALS" ] && [ -z "$CLAUDE_API_KEY" ]; then
  log "  WARNING: No Claude credentials found (CLAUDE_OAUTH_CREDENTIALS / CLAUDE_API_KEY not set)"
fi

chown -R "$DEV_USER:devs" "$DEV_HOME"

# ── Scaffold project on volume (first boot only) ───────────────
# Run as DEV_USER so all files are created with correct ownership (no chown needed).
if [ ! -f "$APP_DIR/package.json" ]; then
  log "Scaffolding new project: $APP_NAME"
  install -d -o "$DEV_USER" -g devs "$APP_DIR"
  log "  Running crayon init..."
  su -s /bin/bash "$DEV_USER" -c "cd '$APP_DIR' && "$CRAYON" init '$APP_NAME' --dir . --no-install"

  # Generate CLAUDE.md with cloud hosting context so Claude Code knows the public URL
  if [ -n "$FLY_APP_NAME" ]; then
    cat > "$APP_DIR/CLAUDE.md" <<CLAUDEMD
# Cloud Dev Environment

This app is hosted on Fly.io. The public URL is:
https://${FLY_APP_NAME}.fly.dev/

When running \`npm run dev\`, the app is available at the public URL above, NOT at localhost.
The dev server (Next.js) binds to 0.0.0.0:3000 inside the container, and Fly proxies traffic to it.
CLAUDEMD
    chown "$DEV_USER:devs" "$APP_DIR/CLAUDE.md"
  fi

  # Symlink to image's /node_modules so Turbopack resolves packages immediately.
  # (Turbopack doesn't do parent-directory node_modules resolution like Node.js does.)
  # Background copy replaces symlink with real dir so npm install works later.
  ln -s /node_modules "$APP_DIR/node_modules"
  chown -h "$DEV_USER:devs" "$APP_DIR/node_modules"

  log "  Starting node_modules population in background..."
  touch /tmp/node_modules.lock
  (
    exec 9>/tmp/node_modules.lock
    flock 9
    rm -rf "$APP_DIR/node_modules_temp"
    cp -r /node_modules/. "$APP_DIR/node_modules_temp/"
    chown -R "$DEV_USER:devs" "$APP_DIR/node_modules_temp"
    # Replace symlink with real directory
    rm "$APP_DIR/node_modules"
    mv "$APP_DIR/node_modules_temp" "$APP_DIR/node_modules"
    # Pin runcrayon to global install in the real copy
    rm -rf "$APP_DIR/node_modules/runcrayon"
    ln -s "$(npm root -g)/runcrayon" "$APP_DIR/node_modules/runcrayon"
    log "  node_modules population complete"
  ) &

  log "  Scaffold complete"
fi

# ── Verify ownership (disabled — slow on large trees, enable for debugging) ──
# BAD_FILES=$(find "$APP_DIR" -not -user "$DEV_USER" -o -not -group devs 2>/dev/null | head -20)
# if [ -n "$BAD_FILES" ]; then
#   log "WARNING: Files with wrong ownership:"
#   echo "$BAD_FILES"
# fi

# ── Pin runcrayon to image version (every boot) ──────────────────────────
# Replace any stale copy with a symlink to the global install baked into the image.
# Skip when node_modules is a symlink (first boot) — /node_modules/runcrayon already
# points to the global install via the image's own symlink.
if [ -d "$APP_DIR/node_modules" ] && [ ! -L "$APP_DIR/node_modules" ]; then
  rm -rf "$APP_DIR/node_modules/runcrayon" "$APP_DIR/node_modules/crayon"
  ln -s "$(npm root -g)/runcrayon" "$APP_DIR/node_modules/runcrayon"
fi

# ── SSH server setup ──────────────────────────────────────────
# Persist host keys on volume so they survive redeployments (avoids "host key changed" warnings)
if [ ! -f /data/ssh_host_keys/ssh_host_ed25519_key ]; then
  log "Generating SSH host keys..."
  mkdir -p /data/ssh_host_keys
  ssh-keygen -t ed25519 -f /data/ssh_host_keys/ssh_host_ed25519_key -N "" -q
  ssh-keygen -t rsa -b 4096 -f /data/ssh_host_keys/ssh_host_rsa_key -N "" -q
fi
# Point sshd at the persistent keys
for key in /data/ssh_host_keys/ssh_host_*; do
  ln -sf "$key" "/etc/ssh/$(basename "$key")"
done

# Write authorized key for SSH access
if [ -n "$SSH_PUBLIC_KEY" ]; then
  log "Setting up SSH authorized key for $DEV_USER..."
  install -d -m 700 -o "$DEV_USER" -g devs "$DEV_HOME/.ssh"
  printf '%s\n' "$SSH_PUBLIC_KEY" > "$DEV_HOME/.ssh/authorized_keys"
  chmod 600 "$DEV_HOME/.ssh/authorized_keys"
  chown "$DEV_USER:devs" "$DEV_HOME/.ssh/authorized_keys"
fi

# Export Fly secrets to /etc/environment so SSH sessions see them (read by PAM)
log "Writing environment for SSH sessions..."
: > /etc/environment
while IFS='=' read -r key value; do
  case "$key" in
    SSH_PUBLIC_KEY|HOSTNAME|HOME|USER|PWD|SHLVL|_) continue ;;
  esac
  printf '%s=%s\n' "$key" "$value" >> /etc/environment
done < <(env)
printf 'PATH=%s/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\n' "$DEV_HOME" >> /etc/environment

# Configure and start sshd (port 2222, key-only auth)
cat > /etc/ssh/sshd_config.d/cloud-dev.conf <<SSHCFG
Port 2222
PasswordAuthentication no
PermitRootLogin no
AllowUsers $DEV_USER
SSHCFG

log "Starting sshd on port 2222..."
/usr/sbin/sshd

# ── Start user app in background ────────────────────────────────
# node_modules is available immediately (symlink on first boot, real dir on subsequent boots),
# so the app can start right away without waiting for the background copy.
if [ -f "$APP_DIR/package.json" ]; then
  log "Starting user app (npm run dev)..."
  su -s /bin/bash "$DEV_USER" -c "cd '$APP_DIR' && npm run dev -- --hostname 0.0.0.0 2>&1 | tee -a /data/app.log &"
fi

# ── Start dev server as the user ────────────────────────────────
log "Starting dev server..."
cd "$APP_DIR"
export HOME="$(eval echo "~$DEV_USER")"
export PATH="$DEV_HOME/.local/bin:$PATH"
exec su -s /bin/bash --preserve-environment "$DEV_USER" -c ""$CRAYON" dev --host --verbose --dangerously-skip-permissions 2>&1 | tee -a /data/dev-ui.log"
