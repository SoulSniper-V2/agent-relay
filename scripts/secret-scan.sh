#!/usr/bin/env bash
# Fail if tracked files or git history contain live-looking secrets. Does not print secret bytes.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
fail=0

report() {
  local name="$1"
  local hits="$2"
  local fields="$3"
  if [ -n "$hits" ]; then
    echo "secret-scan: $name matched:"
    echo "$hits" | awk -F: -v n="$fields" '{
      if (n == 3 && NF >= 3) print "  " $1 ":" $2 ":" $3
      else if (NF >= 2) print "  " $1 ":" $2
      else print "  " $0
    }'
    fail=1
  fi
}

scan_worktree() {
  local name="$1"
  local pat="$2"
  local hits
  hits="$(git grep -I -n -E "$pat" -- . ':!.git' || true)"
  report "$name" "$hits" 2
}

scan_history() {
  local name="$1"
  local pat="$2"
  local hits
  hits="$(git rev-list --all | xargs -n 40 git grep -I -n -E "$pat" || true)"
  report "$name (history)" "$hits" 3
}

for spec in \
  "arl_token|arl_[0-9a-fA-F]{48}" \
  "resend_key|re_[A-Za-z0-9]{20,}" \
  "npm_token|npm_[A-Za-z0-9]{20,}" \
  "ghp|ghp_[A-Za-z0-9]{20,}" \
  "github_pat|github_pat_[A-Za-z0-9_]{20,}" \
  "aws_akia|AKIA[0-9A-Z]{16}" \
  "private_key|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY"
do
  name="${spec%%|*}"
  pat="${spec#*|}"
  scan_worktree "$name" "$pat"
  scan_history "$name" "$pat"
done

if [ "$fail" -ne 0 ]; then
  echo "secret-scan: refuse to ship live credentials"
  exit 1
fi
echo "secret-scan: ok"
