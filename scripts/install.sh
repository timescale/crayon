#!/usr/bin/env bash
# 0pflow bootstrap installer
# Usage: curl -fsSL https://raw.githubusercontent.com/timescale/0pflow/main/scripts/install.sh | bash
{

set -euo pipefail

# ── Colors (disabled if not a terminal) ──────────────────────────────────────

if [ -t 2 ]; then
  RED='\033[0;31m'
  GREEN='\033[0;32m'
  YELLOW='\033[0;33m'
  CYAN='\033[0;36m'
  BOLD='\033[1m'
  DIM='\033[2m'
  RESET='\033[0m'
else
  RED='' GREEN='' YELLOW='' CYAN='' BOLD='' DIM='' RESET=''
fi

info()    { printf "${CYAN}  ...${RESET}  %s\n" "$*" >&2; }
success() { printf "${GREEN}  OK${RESET}  %s\n" "$*" >&2; }
warn()    { printf "${YELLOW}  !!${RESET}  %s\n" "$*" >&2; }
error()   { printf "${RED}  !!${RESET}  %s\n" "$*" >&2; }
fatal()   { error "$@"; exit 1; }
step()    { printf "\n${BOLD}%s${RESET}\n" "$*" >&2; }

has_cmd() { command -v "$1" >/dev/null 2>&1; }

# ── Banner ───────────────────────────────────────────────────────────────────

print_banner() {
  printf "\n${RED}"
  cat >&2 << 'BANNER'
   ___        __ _
  / _ \ _ __ / _| | _____      __
 | | | | '_ \ |_| |/ _ \ \ /\ / /
 | |_| | |_) |  _| | (_) \ V  V /
  \___/| .__/|_| |_|\___/ \_/\_/
       |_|
BANNER
  printf "${RESET}\n" >&2
}

# ── OS detection ─────────────────────────────────────────────────────────────

detect_os() {
  case "$(uname -s)" in
    Darwin*) OS="macos" ;;
    Linux*)  OS="linux" ;;
    *)       fatal "Unsupported operating system: $(uname -s). Only macOS and Linux are supported." ;;
  esac
}

# ── Step 1: Node.js ─────────────────────────────────────────────────────────

install_node() {
  step "Step 1/2: Node.js"

  if has_cmd node; then
    local node_version node_major
    node_version=$(node --version 2>/dev/null | sed 's/^v//')
    node_major=$(echo "$node_version" | cut -d. -f1)
    if [ "$node_major" -ge 20 ] 2>/dev/null; then
      success "Node.js v${node_version} found"
      return 0
    else
      warn "Node.js v${node_version} found, but v20+ is required"
    fi
  fi

  info "Installing Node.js via nvm..."

  # Install nvm (idempotent — safe to re-run)
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

  # Load nvm into current session
  export NVM_DIR="${HOME}/.nvm"
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"

  nvm install 24

  if has_cmd node && has_cmd npx; then
    success "Node.js $(node --version) installed"
  else
    fatal "Node.js installation failed. Install manually: https://nodejs.org"
  fi
}

# ── Step 2: Claude Code CLI ─────────────────────────────────────────────────

install_claude() {
  step "Step 2/2: Claude Code CLI"

  if has_cmd claude; then
    success "Claude Code CLI found"
    return 0
  fi

  info "Installing Claude Code CLI..."
  curl -fsSL https://claude.ai/install.sh | bash

  # The installer may not update PATH in the current session — probe known locations
  for dir in "${HOME}/.claude/local/bin" "${HOME}/.local/bin" "/usr/local/bin"; do
    if [ -x "${dir}/claude" ]; then
      export PATH="${dir}:${PATH}"
      break
    fi
  done

  if has_cmd claude; then
    success "Claude Code CLI installed"
  else
    fatal "Claude Code CLI installation failed. Install manually: https://claude.ai/code"
  fi
}

# ── Shell alias ──────────────────────────────────────────────────────────────

setup_alias() {
  local alias_line="alias 0pflow='npx -y --prefer-online --loglevel=error 0pflow@dev'"
  local alias_comment="# 0pflow CLI alias"
  local added_to=""

  add_to_rc() {
    local rc_file="$1"
    if [ -f "$rc_file" ] || [ "${2:-}" = "create" ]; then
      if grep -qF "alias 0pflow=" "$rc_file" 2>/dev/null; then
        # Replace existing alias (remove old comment + alias lines)
        local tmp
        tmp=$(mktemp)
        grep -vF "alias 0pflow=" "$rc_file" | grep -vF "# 0pflow CLI alias" > "$tmp"
        printf '\n%s\n%s\n' "$alias_comment" "$alias_line" >> "$tmp"
        mv "$tmp" "$rc_file"
      else
        printf '\n%s\n%s\n' "$alias_comment" "$alias_line" >> "$rc_file"
      fi
      added_to="${added_to:+${added_to}, }${rc_file}"
    fi
  }

  local user_shell
  user_shell=$(basename "${SHELL:-/bin/bash}")

  case "$user_shell" in
    zsh)
      add_to_rc "${HOME}/.zshrc"
      ;;
    bash)
      if [ "$OS" = "macos" ] && [ -f "${HOME}/.bash_profile" ]; then
        add_to_rc "${HOME}/.bash_profile"
      fi
      add_to_rc "${HOME}/.bashrc"
      ;;
    *)
      [ -f "${HOME}/.zshrc" ] && add_to_rc "${HOME}/.zshrc"
      [ -f "${HOME}/.bashrc" ] && add_to_rc "${HOME}/.bashrc"
      ;;
  esac

  # Fallback: create .bashrc if nothing was written
  if [ -z "$added_to" ]; then
    add_to_rc "${HOME}/.bashrc" "create"
  fi

  success "Added shell alias to ${added_to}"
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  print_banner
  detect_os

  printf "${DIM}  Detected: %s (%s)${RESET}\n" "$OS" "$(uname -m)" >&2

  install_node
  install_claude
  setup_alias

  # Determine which rc file to source
  local rc_file="${HOME}/.zshrc"
  case "$(basename "${SHELL:-/bin/bash}")" in
    bash) rc_file="${HOME}/.bashrc" ;;
  esac

  printf "\n"
  printf "${GREEN}${BOLD}  Installation complete!${RESET}\n\n" >&2
  printf "${BOLD}  To get started, run:${RESET}\n\n" >&2
  printf "${CYAN}    source ${rc_file} && 0pflow cloud run${RESET}\n\n" >&2
}

main "$@"

}
