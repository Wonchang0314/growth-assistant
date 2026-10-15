#!/usr/bin/env bash
# 예전 Discord 봇(launchd 사용자 에이전트) 등록을 해제한다. 상시 실행 봇은 1단계에서 없앴으므로(ADR-0018),
# 예전에 ops/install.sh로 등록했던 기기에서 한 번 실행한다. 배포한 릴리스와 로그(~/.growth-assistant)는 남겨 둔다.
set -euo pipefail

LABEL="com.growthassistant.bot"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "해제함: $LABEL"
