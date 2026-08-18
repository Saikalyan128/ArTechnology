#!/usr/bin/env bash
# Multi-day demo tunnel: keep this Mac awake + this script running.
# URL lasts while process is up (hours/days), NOT forever.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
CF_BIN="${CF_BIN:-/tmp/cloudflared}"

if [[ ! -x "$CF_BIN" ]]; then
  echo "Downloading cloudflared..."
  curl -sL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" -o /tmp/cloudflared.tgz
  tar -xzf /tmp/cloudflared.tgz -C /tmp
  chmod +x /tmp/cloudflared
  CF_BIN=/tmp/cloudflared
fi

if ! curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
  echo "Starting frontend server on :${PORT} ..."
  (cd "$ROOT" && npx --yes serve -l "$PORT") &
  sleep 2
fi

echo "Starting Cloudflare quick tunnel -> http://127.0.0.1:${PORT}"
echo "Leave this terminal open. Copy the https://*.trycloudflare.com URL."
echo "Then: python3 scripts/make-tunnel-qr.py '<that-url>'"
echo "Tip: prevent Mac sleep (Energy Saver / caffeinate -dims)."
# caffeinate keeps machine awake while tunnel runs (optional if already on AC)
if command -v caffeinate >/dev/null 2>&1; then
  exec caffeinate -dims "$CF_BIN" tunnel --url "http://127.0.0.1:${PORT}"
else
  exec "$CF_BIN" tunnel --url "http://127.0.0.1:${PORT}"
fi
