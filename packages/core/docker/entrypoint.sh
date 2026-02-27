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

  # Copy pre-cached /node_modules onto the volume in the background.
  # -L dereferences symlinks so all files land as real writable files (fixes
  # npm EPERM when it tries to chmod bin entries on the overlay FS).
  # Copies to a temp dir first, then renames atomically so if the dev server
  # starts before the copy finishes, Node.js still resolves packages via
  # parent-directory lookup to /node_modules.
  log "  Starting node_modules population in background..."
  touch /tmp/node_modules.lock  # create before forking so preinstall hook sees it immediately
  (
    # Hold a flock for the duration of the copy so any concurrent `npm install`
    # (e.g. from Claude) blocks in its preinstall hook until we finish.
    exec 9>/tmp/node_modules.lock
    flock 9
    rm -rf "$APP_DIR/node_modules_temp"
    cp -r /node_modules/. "$APP_DIR/node_modules_temp/"
    chown -R "$DEV_USER:devs" "$APP_DIR/node_modules_temp"
    # mv is atomic on Linux (same filesystem) — either succeeds or fails if
    # node_modules was created by a concurrent npm install. Either way is safe.
    if mv "$APP_DIR/node_modules_temp" "$APP_DIR/node_modules" 2>/dev/null; then
      log "node_modules population complete"
    else
      rm -rf "$APP_DIR/node_modules_temp"
      log "node_modules already exists (concurrent npm), discarding temp copy"
    fi
  ) &

  log "  Scaffold complete"
fi

# ── Verify ownership (disabled — slow on large trees, enable for debugging) ──
# BAD_FILES=$(find "$APP_DIR" -not -user "$DEV_USER" -o -not -group devs 2>/dev/null | head -20)
# if [ -n "$BAD_FILES" ]; then
#   log "WARNING: Files with wrong ownership:"
#   echo "$BAD_FILES"
# fi

# ── Pin crayon to image version (every boot) ────────────────────────────
# Remove any local copy so Node.js resolves via parent-directory lookup
# to /node_modules/crayon (symlinked to the global install baked into the image).
# This avoids a symlink in the app's node_modules that npm would try to chmod.
rm -rf "$APP_DIR/node_modules/crayon"

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

# ── Start dev server as the user ────────────────────────────────
log "Starting dev server..."
cd "$APP_DIR"
export HOME="$(eval echo "~$DEV_USER")"
export PATH="$DEV_HOME/.local/bin:$PATH"
exec su -s /bin/bash --preserve-environment "$DEV_USER" -c ""$CRAYON" dev --host --dangerously-skip-permissions"
