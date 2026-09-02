#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/clawman"

ROOT="/Users/clawman/.openclaw/workspace/hiro-pr-tracker"
cd "$ROOT"

git pull --ff-only origin main

previous="$(mktemp)"
if [[ -f data/prs.json ]]; then
  cp data/prs.json "$previous"
else
  printf '{}\n' > "$previous"
fi

npm run refresh

if node - "$previous" data/prs.json <<'NODE'
const { readFileSync } = require("node:fs");

function normalized(file) {
  const value = JSON.parse(readFileSync(file, "utf8"));
  delete value.generatedAt;
  return JSON.stringify(value);
}

process.exit(normalized(process.argv[2]) === normalized(process.argv[3]) ? 0 : 1);
NODE
then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) no PR data changes"
  rm -f "$previous"
  exit 0
fi

rm -f "$previous"
npm run encrypt

git add data/prs.enc.json
if git diff --cached --quiet; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) no published data changes"
  exit 0
fi

git commit -m "Refresh PR tracker data"
git push origin main
