#!/usr/bin/env bash
# MCP HTTP 서버(dist/mcp-http.js)를 LaunchAgent로 등록해 상시 실행한다(ADR-0035). 다시 실행해도 된다(내렸다가 다시 올린다).
# 배포된 릴리스를 띄우므로 ops/deploy.sh를 먼저 실행한다. 그 뒤 배포는 에이전트를 알아서 다시 띄우므로 이 스크립트를 다시 돌리지 않는다.
# 템플릿(ops/com.growthassistant.server.plist)이나 .env 위치·로그 위치를 바꿨을 때만 다시 실행한다.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_DIR/ops/common.sh"
ENV_FILE="$PROJECT_DIR/.env"
SERVER="$APP_DIR/current/dist/mcp-http.js"

[[ "$(uname)" == "Darwin" ]] || { echo "macOS에서만 실행한다." >&2; exit 1; }
[[ -f "$SERVER" && -x "$APP_DIR/node" ]] || { echo "배포된 릴리스가 없다: $SERVER, $APP_DIR/node. ops/deploy.sh를 먼저 실행한다." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo ".env가 없다: $ENV_FILE. cp .env.example .env 후 값을 채운다." >&2; exit 1; }

mkdir -p "$LOG_DIR/launchd" "$(dirname "$AGENT_PLIST")"
sed -e "s|__APP_DIR__|$APP_DIR|g" \
    -e "s|__ENV_FILE__|$ENV_FILE|g" \
    -e "s|__LOG_DIR__|$LOG_DIR|g" \
    -e "s|__HOME__|$HOME|g" \
    "$PROJECT_DIR/ops/$AGENT_LABEL.plist" > "$AGENT_PLIST"
plutil -lint "$AGENT_PLIST"

agent_bootout
launchctl bootstrap "gui/$(id -u)" "$AGENT_PLIST"
echo "등록함: $AGENT_LABEL ($SERVER)"

# 에이전트의 PATH(plist)에서 claude를 찾을 수 있는지 미리 본다. 못 찾으면 출제·추출 도구가 ENOENT로 실패한다.
agent_path="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:PATH' "$AGENT_PLIST")"
if ! grep -q '^CLAUDE_EXECUTABLE=' "$ENV_FILE" && ! PATH="$agent_path" command -v claude >/dev/null; then
    echo "주의: 에이전트의 PATH에 claude가 없다. .env에 CLAUDE_EXECUTABLE=$(command -v claude || echo '<claude 경로>')를 넣고 이 스크립트를 다시 실행한다." >&2
fi

cat <<EOF
상태: launchctl print $AGENT_TARGET | grep -E 'state|pid|last exit'
로그: tail -F $LOG_DIR/mcp-http/current.log (시작 실패는 $LOG_DIR/launchd/server.err.log)
EOF
