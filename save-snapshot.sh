#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [[ ! -d .git ]]; then
  echo "This snapshot helper must be run from inside the git repo." >&2
  exit 1
fi

timestamp="$(date +"%Y%m%d-%H%M%S")"
tag_name="save-${timestamp}"
message="${1:-Snapshot ${timestamp}}"

if [[ -n "$(git status --short)" ]]; then
  git add -A
  git commit -m "$message"
else
  echo "Working tree is clean. Tagging the current commit without creating a new commit."
fi

git tag -a "$tag_name" -m "$message"

echo "Created snapshot tag: $tag_name"
echo "Restore with: git checkout $tag_name"
