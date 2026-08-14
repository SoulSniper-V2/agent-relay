#!/usr/bin/env bash
# Create a PRIVATE GitHub repo and push this branch.
# Requires: gh auth login   (this cloud environment was not logged in)
set -euo pipefail
cd "$(dirname "$0")/.."
if ! gh auth status >/dev/null 2>&1; then
  echo "Not logged in. Run: gh auth login -h github.com -s repo" >&2
  echo "Then re-run: bash scripts/create-private-repo.sh [owner/name]" >&2
  exit 1
fi
NAME="${1:-agent-relay}"
if [[ "$NAME" == */* ]]; then
  gh repo create "$NAME" --private --source=. --remote=origin --push
else
  gh repo create "$NAME" --private --source=. --remote=origin --push
fi
gh repo view --json isPrivate,url
