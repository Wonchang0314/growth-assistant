#!/usr/bin/env bash
# Mac에서 한 번 실행한다: 릴리스를 배포하고 launchd 사용자 에이전트로 등록한다. 다시 실행해도 된다.
# Node를 올렸거나 경로가 바뀌었을 때도 다시 실행한다 (plist에 node 절대 경로가 들어간다).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.growthassistant.bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

[[ "$(uname)" == "Darwin" ]] || { echo "macOS에서만 실행한다." >&2; exit 1; }
[[ -f "$PROJECT_DIR/.env" ]] || { echo ".env가 없다. cp .env.example .env 후 값을 채운다." >&2; exit 1; }

# Homebrew node@24를 우선 쓴다. 이 경로는 패치 업데이트에도 바뀌지 않는다.
NODE="/opt/homebrew/opt/node@24/bin/node"
[[ -x "$NODE" ]] || NODE="$(command -v node || true)"
[[ -n "$NODE" && -x "$NODE" ]] || { echo "node를 찾지 못했다. brew install node@24" >&2; exit 1; }
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' \
    || { echo "Node 24 이상이 필요하다: $("$NODE" -v) ($NODE)" >&2; exit 1; }
NODE_DIR="$(dirname "$NODE")"

mkdir -p "$HOME/.growth-assistant/logs" "$HOME/Library/LaunchAgents"

# 이미 등록돼 있으면 내린 뒤 다시 올린다.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

PATH="$NODE_DIR:$PATH" "$PROJECT_DIR/ops/deploy.sh"

sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__NODE_DIR__|$NODE_DIR|g" \
    -e "s|__NODE__|$NODE|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PROJECT_DIR/ops/$LABEL.plist" > "$PLIST"
plutil -lint "$PLIST"

launchctl bootstrap "$DOMAIN" "$PLIST"
echo "등록함: $LABEL (node: $NODE, 로그: ~/.growth-assistant/logs/current.log)"
