#!/usr/bin/env bash
# launchd 등록을 해제한다. 배포한 jar와 로그(~/.growth-assistant)는 남겨 둔다.
set -euo pipefail

LABEL="com.growthassistant.bot"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "해제함: $LABEL"
