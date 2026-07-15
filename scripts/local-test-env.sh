#!/usr/bin/env bash
#
# local-test-env.sh — source this in a terminal to "become" machine A or B
# for local two-machine testing of claudeport. Redirects the config dir, clone
# dir, and claudeport's own config into an isolated sandbox folder, and wraps
# the locally-built CLI so `claudeport` runs `node dist/index.js`.
#
# Usage (must be sourced, not executed):
#   source scripts/local-test-env.sh a      # machine A
#   source scripts/local-test-env.sh b      # machine B
#
# Run `pnpm test:local:setup` first to create the sandbox.

# --- resolve this script's own path (zsh + bash) ---------------------------
if [ -n "${ZSH_VERSION:-}" ]; then
  # zsh: %N expands to the sourced file's path.
  _cp_self="${(%):-%N}"
elif [ -n "${BASH_SOURCE:-}" ]; then
  _cp_self="${BASH_SOURCE[0]}"
else
  _cp_self="$0"
fi

_cp_machine="${1:-}"
if [ "$_cp_machine" != "a" ] && [ "$_cp_machine" != "b" ]; then
  echo "Usage: source scripts/local-test-env.sh {a|b}" >&2
  unset _cp_self _cp_machine
  return 1 2>/dev/null || exit 1
fi

_cp_repo_root="$(cd "$(dirname "$_cp_self")/.." && pwd)"
_cp_sandbox="$_cp_repo_root/.local-test"

if [ ! -d "$_cp_sandbox" ]; then
  echo "Sandbox not found at $_cp_sandbox" >&2
  echo "Run 'pnpm test:local:setup' first." >&2
  unset _cp_self _cp_machine _cp_repo_root _cp_sandbox
  return 1 2>/dev/null || exit 1
fi

if [ "$_cp_machine" = "a" ]; then
  _cp_dir="$_cp_sandbox/machineA"
else
  _cp_dir="$_cp_sandbox/machineB"
fi

# --- export env: env vars win over config file in src/lib/paths.ts ----------
export CLAUDE_CONFIG_DIR="$_cp_dir/.claude"   # what gets synced (fake ~/.claude)
export CLAUDEPORT_DIR="$_cp_dir/.claudeport"  # local git clone
export XDG_CONFIG_HOME="$_cp_dir/.config"     # isolates claudeport's config.json
export CLAUDEPORT_TEST_REMOTE="file://$_cp_sandbox/remote.git"

# --- wrap the locally-built CLI (no global npm link needed) -----------------
# Bake the absolute dist path into the function so it survives the unset below;
# redefined on each source so it always points at the current repo's dist/.
eval "claudeport() { node '$_cp_repo_root/dist/index.js' \"\$@\"; }"

echo "claudeport local test: machine ${_cp_machine} active"
echo "  CLAUDE_CONFIG_DIR = $CLAUDE_CONFIG_DIR"
echo "  CLAUDEPORT_DIR    = $CLAUDEPORT_DIR"
echo "  XDG_CONFIG_HOME   = $XDG_CONFIG_HOME"
echo "  remote            = $CLAUDEPORT_TEST_REMOTE"
echo
echo "Initialize this machine with:"
echo "  claudeport init \"\$CLAUDEPORT_TEST_REMOTE\""

unset _cp_self _cp_machine _cp_repo_root _cp_sandbox _cp_dir
