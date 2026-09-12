#!/usr/bin/env bash
# Keep the fetchable agent docs in lockstep with the skill.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# The repo skill is canonical. Keep installed-host mirrors and the hosted
# reference links in sync with it so a fetched skill can resolve its links.
for target in "$ROOT/.agents/skills/agent-relay" "$ROOT/.cursor/skills/agent-relay"; do
  mkdir -p "$target/references"
  cp "$ROOT/skills/agent-relay/SKILL.md" "$target/SKILL.md"
  cp "$ROOT/skills/agent-relay/references/auth.md" "$target/references/auth.md"
  cp "$ROOT/skills/agent-relay/references/triage.md" "$target/references/triage.md"
done

mkdir -p "$ROOT/www/references"
cp "$ROOT/skills/agent-relay/SKILL.md" "$ROOT/www/skill.md"
cp "$ROOT/skills/agent-relay/references/auth.md" "$ROOT/www/references/auth.md"
cp "$ROOT/skills/agent-relay/references/triage.md" "$ROOT/www/references/triage.md"
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
echo "sync-agent-docs: wrote skill mirrors, www/references, and www/llms-full.txt"
