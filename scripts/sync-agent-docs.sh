#!/usr/bin/env bash
# Keep the fetchable agent docs in lockstep with the skill.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cp "$ROOT/skills/agent-relay/SKILL.md" "$ROOT/www/skill.md"
{
  echo "# Agent Relay (full)"
  echo
  echo "Generated from skill.md, llms.txt, and docs.md. Prefer the smaller files when you can."
  echo
  echo "----- skill.md -----"
  echo
  cat "$ROOT/www/skill.md"
  echo
  echo "----- llms.txt -----"
  echo
  cat "$ROOT/www/llms.txt"
  echo
  echo "----- docs.md -----"
  echo
  cat "$ROOT/www/docs.md"
} > "$ROOT/www/llms-full.txt"
echo "sync-agent-docs: wrote www/skill.md and www/llms-full.txt"
