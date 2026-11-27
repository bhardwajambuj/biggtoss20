#!/bin/bash
# Pull latest main from GitHub and restart Bigg Toss (short WS disconnect).
# MUST NOT touch /var/log/caddy or ~/.bigtoss — visitor/play history is sacred.
set -euo pipefail
APP=/opt/bigtoss
cd "$APP"
echo "== before =="
sudo -u bigtoss git rev-parse --short HEAD
sudo -u bigtoss git fetch --prune origin
sudo -u bigtoss git reset --hard origin/main
echo "== after =="
sudo -u bigtoss git rev-parse --short HEAD
sudo -u bigtoss git log -1 --oneline
# Drop bytecode so Python picks up new modules cleanly (code only, never logs)
sudo -u bigtoss find "$APP" -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
sudo systemctl restart bigtoss
ok=0
for i in $(seq 1 20); do
  if curl -sf --max-time 2 http://127.0.0.1:8020/healthz >/dev/null; then
    ok=1
    break
  fi
  sleep 0.5
done
if [ "$ok" != 1 ]; then
  echo "health check failed" >&2
  sudo systemctl status bigtoss --no-pager -l | head -30 >&2
  exit 1
fi
echo "deploy ok: $(curl -sf http://127.0.0.1:8020/healthz) @ $(sudo -u bigtoss git rev-parse --short HEAD)"
