#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8000}"
HOST="127.0.0.1"

cd "$ROOT_DIR"

printf 'Serving Release Radar at http://%s:%s/index.html\n' "$HOST" "$PORT"
printf 'Use this exact Redirect URI in Spotify: http://%s:%s/index.html\n' "$HOST" "$PORT"
exec /usr/bin/python3 -m http.server "$PORT" --bind "$HOST"
