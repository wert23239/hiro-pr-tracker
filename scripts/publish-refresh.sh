#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/clawman"

ROOT="/Users/clawman/.openclaw/workspace/hiro-pr-tracker"
cd "$ROOT"

git pull --ff-only origin main
npm run build

git add data/prs.enc.json
if git diff --cached --quiet; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) no published data changes"
  exit 0
fi

git commit -m "Refresh PR tracker data"
git push origin main
