#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export HOME="/Users/clawman"

ROOT="/Users/clawman/.openclaw/workspace/hiro-pr-tracker"
cd "$ROOT"

git pull --ff-only origin main

npm run refresh

current_hash="$(node - data/prs.json <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "generatedAt")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortValue(child)])
  );
}

const value = sortValue(JSON.parse(readFileSync(process.argv[2], "utf8")));
process.stdout.write(createHash("sha256").update(JSON.stringify(value)).digest("hex"));
NODE
)"

hash_path="data/prs.hash"
if [[ -f "$hash_path" ]] && [[ "$(cat "$hash_path")" == "$current_hash" ]]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) no PR data changes"
  exit 0
fi

npm run encrypt
printf "%s\n" "$current_hash" > "$hash_path"

git add data/prs.enc.json "$hash_path"
if git diff --cached --quiet; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) no published data changes"
  exit 0
fi

git commit -m "Refresh PR tracker data"
git push origin main
