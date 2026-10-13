#!/usr/bin/env bash
# Mac에서 한 번 실행한다: jar를 배포하고 launchd 사용자 에이전트로 등록한다. 다시 실행해도 된다.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="com.growthassistant.bot"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

[[ "$(uname)" == "Darwin" ]] || { echo "macOS에서만 실행한다." >&2; exit 1; }
[[ -f "$PROJECT_DIR/.env" ]] || { echo ".env가 없다. cp .env.example .env 후 값을 채운다." >&2; exit 1; }

JAVA="$(/usr/libexec/java_home -v 21)/bin/java"
[[ -x "$JAVA" ]] || { echo "JDK 21을 찾지 못했다." >&2; exit 1; }

mkdir -p "$HOME/.growth-assistant/logs" "$HOME/Library/LaunchAgents"

# 이미 등록돼 있으면 내린 뒤 다시 올린다.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

"$PROJECT_DIR/ops/deploy.sh"

sed -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
    -e "s|__JAVA__|$JAVA|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PROJECT_DIR/ops/$LABEL.plist" > "$PLIST"
plutil -lint "$PLIST"

launchctl bootstrap "$DOMAIN" "$PLIST"
echo "등록함: $LABEL (로그: ~/.growth-assistant/logs/growth-assistant.log)"
