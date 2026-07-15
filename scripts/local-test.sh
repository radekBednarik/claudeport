#!/usr/bin/env bash
#
# local-test.sh — set up / tear down a sandbox for simulating two machines
# syncing config with claudeport, on a single box, using a local bare git repo
# as the "remote". See README ("Local two-machine testing") for the workflow.
#
# Usage: bash scripts/local-test.sh {setup|teardown|reset}
# Normally invoked via pnpm: `pnpm test:local:setup` etc.

set -euo pipefail

# Repo root = parent of this script's directory.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SANDBOX="$REPO_ROOT/.local-test"
REMOTE="$SANDBOX/remote.git"

seed_machine_a() {
  local claude="$SANDBOX/machineA/.claude"
  mkdir -p "$claude/agents"

  cat >"$claude/settings.json" <<'JSON'
{
  "_note": "Fake settings seeded by scripts/local-test.sh for local two-machine testing.",
  "theme": "dark",
  "model": "claude-opus-4-8"
}
JSON

  cat >"$claude/CLAUDE.md" <<'MD'
# Sample CLAUDE.md (machine A seed)

This file is fake config seeded for local two-machine testing of claudeport.
Edit it, then `claudeport push` on A and `claudeport pull` on B to see it sync.
MD

  cat >"$claude/agents/example.md" <<'MD'
---
name: example
description: A fake example agent seeded for local claudeport testing.
---

You are an example agent used only to test config sync.
MD
}

setup() {
  if [ -d "$SANDBOX" ]; then
    echo "Sandbox already exists at $SANDBOX"
    echo "Run 'pnpm test:local:reset' to recreate it, or 'pnpm test:local:teardown' first."
    exit 1
  fi

  echo "Building CLI (pnpm build) …"
  (cd "$REPO_ROOT" && pnpm build)

  echo "Creating sandbox at $SANDBOX …"
  mkdir -p "$SANDBOX"

  echo "Initializing bare 'remote' repo …"
  git init --bare --quiet "$REMOTE"

  # Machine A is seeded with sample config; machine B starts empty and will
  # adopt A's config by pulling on init. .claudeport/ clones are created by
  # `claudeport init`. .config/ isolates claudeport's own config.json.
  mkdir -p "$SANDBOX/machineA/.config" "$SANDBOX/machineB/.claude" "$SANDBOX/machineB/.config"
  seed_machine_a

  cat <<EOF

Sandbox ready.

  remote:   file://$REMOTE
  machineA: $SANDBOX/machineA   (seeded with sample ~/.claude config)
  machineB: $SANDBOX/machineB   (empty — will adopt config on init)

Next steps (one terminal per machine):

  # Terminal 1 — machine A
  source scripts/local-test-env.sh a
  claudeport init "\$CLAUDEPORT_TEST_REMOTE"

  # Terminal 2 — machine B
  source scripts/local-test-env.sh b
  claudeport init "\$CLAUDEPORT_TEST_REMOTE"

Then edit files under $SANDBOX/machineA/.claude and use
'claudeport push' / 'claudeport pull' / 'claudeport status' / 'claudeport diff'.

Tear down with: pnpm test:local:teardown
EOF
}

teardown() {
  if [ -d "$SANDBOX" ]; then
    echo "Removing sandbox at $SANDBOX …"
    rm -rf "$SANDBOX"
    echo "Done."
  else
    echo "No sandbox at $SANDBOX — nothing to remove."
  fi
}

case "${1:-}" in
  setup) setup ;;
  teardown) teardown ;;
  reset)
    teardown
    setup
    ;;
  *)
    echo "Usage: bash scripts/local-test.sh {setup|teardown|reset}" >&2
    exit 2
    ;;
esac
