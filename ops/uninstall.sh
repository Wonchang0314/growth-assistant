#!/usr/bin/env bash
# 상시 실행 MCP HTTP 서버(LaunchAgent) 등록을 해제한다.
# 배포한 릴리스와 로그(~/.growth-assistant)는 남겨 둔다. 다시 등록하려면 ops/install.sh.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_DIR/ops/common.sh"

agent_bootout
rm -f "$AGENT_PLIST"
echo "해제함: $AGENT_LABEL"
