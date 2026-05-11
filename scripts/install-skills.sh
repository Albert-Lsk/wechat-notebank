#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_SRC="$ROOT_DIR/skills/alskai-notebank"
CLAUDE_COMMAND_SRC="$ROOT_DIR/.claude/commands/alskai-notebank.md"

if [[ ! -f "$SKILL_SRC/SKILL.md" ]]; then
  echo "Missing skill source: $SKILL_SRC/SKILL.md" >&2
  exit 1
fi

if [[ ! -f "$CLAUDE_COMMAND_SRC" ]]; then
  echo "Missing Claude Code command source: $CLAUDE_COMMAND_SRC" >&2
  exit 1
fi

install_skill() {
  local base_dir="$1"
  local label="$2"
  local target="$base_dir/alskai-notebank"

  mkdir -p "$base_dir"
  rm -rf "$target"
  cp -R "$SKILL_SRC" "$target"
  echo "Installed $label skill: $target"
}

install_skill "$HOME/.claude/skills" "Claude Code"
install_skill "$HOME/.codex/skills" "Codex"
install_skill "$HOME/.agents/skills" "Codex legacy"

mkdir -p "$HOME/.claude/commands"
cp "$CLAUDE_COMMAND_SRC" "$HOME/.claude/commands/alskai-notebank.md"
echo "Installed Claude Code slash command: $HOME/.claude/commands/alskai-notebank.md"

echo
echo "Restart Claude Code or Codex for newly installed skills to be discovered."
