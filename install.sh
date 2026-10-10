#!/usr/bin/env bash
# haren installer for macOS and Linux.
#   curl -fsSL https://raw.githubusercontent.com/odarino/haren/main/install.sh | bash
# Pin a version:  curl -fsSL ... | HAREN_VERSION=1.2.0 bash
set -euo pipefail

HAREN_VERSION="${HAREN_VERSION:-latest}"
TTY_DEVICE="${HAREN_INSTALL_TTY:-/dev/tty}"

info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Everything runs inside main, so a partial download executes nothing.
main() {
  local os arch bun_bin answer workspace
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin | Linux) ;;
    *) fail "Unsupported OS: $os. On Windows, run install.ps1 in PowerShell." ;;
  esac
  case "$arch" in
    x86_64 | amd64 | arm64 | aarch64) ;;
    *) fail "Unsupported architecture: $arch." ;;
  esac

  if ! command -v bun >/dev/null 2>&1; then
    info "Installing Bun (https://bun.sh)"
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
  command -v bun >/dev/null 2>&1 || fail "Bun is not on PATH after install. Open a new terminal and run this script again."

  info "Installing @odarino/haren@$HAREN_VERSION"
  bun add -g "@odarino/haren@$HAREN_VERSION"

  if ! command -v haren >/dev/null 2>&1; then
    bun_bin="$(bun pm bin -g 2>/dev/null || printf '%s' "$HOME/.bun/bin")"
    export PATH="$bun_bin:$PATH"
    info "Add this line to your shell profile: export PATH=\"$bun_bin:\$PATH\""
  fi

  # Under `curl | bash`, stdin is the script itself. Talk to the terminal instead.
  # fd 3 reads answers, fd 4 writes the prompt (separate fds keep a plain file test seam working).
  # shellcheck disable=SC2094
  if [ -n "${CI:-}" ] || ! { exec 3<"$TTY_DEVICE" 4>>"$TTY_DEVICE"; } 2>/dev/null; then
    info "Installed. Next: cd <your workspace> && haren init"
    exit 0
  fi
  command -v haren >/dev/null 2>&1 || fail "haren is not on PATH. Open a new terminal, then run: haren init"

  printf 'Workspace path [%s]: ' "$PWD" >&4
  answer=""
  read -r answer <&3 || true
  workspace="${answer:-$PWD}"
  case "$workspace" in
    \~) workspace="$HOME" ;;
    \~/*) workspace="$HOME/${workspace#\~/}" ;;
  esac

  haren init --dir "$workspace" <&3
}

main "$@"
