#!/usr/bin/env bash
# 검사(테스트 포함)와 빌드를 거친 코드를 새 릴리스 디렉터리에 배포하고, DB 마이그레이션을 적용한 뒤 current를 바꾼다.
# Claude Desktop은 current의 MCP 서버(dist/mcp-stdio.js)를 띄우므로, 개발 중인 작업 트리를 고쳐도 Desktop의 도구가 깨지지 않는다.
# 상시 실행 MCP HTTP 서버(LaunchAgent, ops/install.sh)가 등록돼 있으면 current를 바꾼 뒤 다시 띄운다.
# 실행 중인 릴리스의 파일을 덮어쓰지 않도록 릴리스마다 디렉터리를 따로 만든다. 최근 3개만 남긴다.
#   ~/.growth-assistant/app/releases/<시각>/{dist, node_modules, package.json}
#   ~/.growth-assistant/app/current -> releases/<시각>
#   ~/.growth-assistant/app/node -> 배포에 쓴 node (Claude Desktop 설정이 가리키는 고정 경로)
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
source "$PROJECT_DIR/ops/common.sh"
KEEP_RELEASES=3

cd "$PROJECT_DIR"
[[ -f .env ]] || { echo ".env가 없다. cp .env.example .env 후 값을 채운다." >&2; exit 1; }
want="v$(tr -d '[:space:]' < .nvmrc)"
[[ "$(node --version)" == "$want" ]] || { echo "node $(node --version)로는 배포하지 않는다. .nvmrc의 $want로 바꾼다 (nvm install)." >&2; exit 1; }
npm ci --no-audit --no-fund
npm run check   # 타입 검사, 린트, 형식, 테스트 (DB 테스트에 Docker가 필요하다)
npm run build

release="$APP_DIR/releases/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$release"
cp -R dist package.json package-lock.json "$release/"
(cd "$release" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)

# MCP 서버는 시작할 때 마이그레이션하지 않으므로 current를 바꾸기 전에 적용한다.
GROWTH_ENV_FILE="$PROJECT_DIR/.env" node "$release/dist/migrate.js"
# 시드 개념(dist/core/knowledge/seed/*.yaml)을 반영한다. 여러 번 돌려도 결과가 같다.
GROWTH_ENV_FILE="$PROJECT_DIR/.env" node "$release/dist/seed.js"

ln -sfn "$release" "$APP_DIR/current"
# Desktop은 셸을 거치지 않아 nvm의 PATH를 모른다. 버전이 바뀌어도 설정을 다시 넣지 않도록 고정 경로의 링크를 바꾼다.
ln -sfn "$(command -v node)" "$APP_DIR/node"
echo "배포함: $release (node $want)"

# 상시 실행 서버는 링크를 시작할 때만 따라가므로 다시 띄운다(-k: 떠 있는 것을 끄고 띄운다). 등록하지 않았으면 건너뛴다.
if agent_loaded; then
    launchctl kickstart -k "$AGENT_TARGET"
    echo "상시 실행 서버를 새 릴리스로 다시 띄웠다: $AGENT_LABEL"
fi

# 오래된 릴리스를 지운다 (current는 항상 가장 최근 것이다).
ls -1d "$APP_DIR"/releases/*/ | sort -r | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    rm -rf "$old"
done

echo "Claude Desktop을 다시 시작하면 새 릴리스의 MCP 서버를 띄운다."
