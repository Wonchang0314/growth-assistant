#!/usr/bin/env bash
# Claude Desktop 설정(claude_desktop_config.json)의 mcpServers에 넣을 growth-assistant 항목을 출력한다. 파일은 고치지 않는다.
# Desktop은 터미널의 PATH를 물려받지 않으므로 node와 서버 파일을 절대 경로로 적는다.
# node는 app/node, 서버 파일은 current 링크를 가리키므로 ops/deploy.sh로 새로 배포하면(node 버전을 바꿨어도) Desktop을 다시 시작하기만 하면 된다.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_DIR/ops/common.sh"
SERVER="$APP_DIR/current/dist/mcp-stdio.js"
ENV_FILE="$PROJECT_DIR/.env"

NODE="$APP_DIR/node"
[[ -f "$SERVER" && -x "$NODE" ]] || { echo "배포된 릴리스가 없다: $SERVER, $NODE. ops/deploy.sh를 먼저 실행한다." >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo ".env가 없다: $ENV_FILE. cp .env.example .env 후 값을 채운다." >&2; exit 1; }

NODE="$NODE" SERVER="$SERVER" ENV_FILE="$ENV_FILE" LOG_DIR="$LOG_DIR" "$NODE" -e '
const { NODE, SERVER, ENV_FILE, LOG_DIR } = process.env;
const entry = { command: NODE, args: [SERVER], env: { GROWTH_ENV_FILE: ENV_FILE, LOG_DIR } };
console.log(JSON.stringify({ mcpServers: { "growth-assistant": entry } }, null, 2));
'

cat >&2 <<EOF

위 내용을 Claude Desktop 설정 파일에 넣는다 (Desktop의 Settings → Developer → Edit Config).
  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
이미 mcpServers가 있으면 "growth-assistant" 항목만 그 안에 더한다. 저장한 뒤 Desktop을 완전히 종료했다가 다시 연다.
node: $("$NODE" --version) ($NODE)
EOF
