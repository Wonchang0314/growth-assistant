#!/usr/bin/env bash
# 상시 실행 MCP HTTP 서버(LaunchAgent) 등록을 해제한다. 예전 Discord 봇 에이전트(com.growthassistant.bot)가 남아 있으면 그것도 해제한다.
# 배포한 릴리스와 로그(~/.growth-assistant)는 남겨 둔다. 다시 등록하려면 ops/install.sh.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_DIR/ops/common.sh"

agent_bootout
rm -f "$AGENT_PLIST"
echo "해제함: $AGENT_LABEL"

LEGACY_LABEL="com.growthassistant.bot"
launchctl bootout "gui/$(id -u)/$LEGACY_LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LEGACY_LABEL.plist"
