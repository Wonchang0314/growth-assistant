#!/usr/bin/env bash
# 검사(테스트 포함)와 빌드를 거친 코드를 새 릴리스 디렉터리에 배포하고, current를 바꾼 뒤 서비스를 재시작한다.
# 실행 중인 릴리스의 파일을 덮어쓰지 않도록 릴리스마다 디렉터리를 따로 만든다. 최근 3개만 남긴다.
#   ~/.growth-assistant/app/releases/<시각>/{dist, node_modules, package.json}
#   ~/.growth-assistant/app/current -> releases/<시각>
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# 배포 위치를 바꿔 시험할 때만 GROWTH_APP_DIR을 지정한다.
APP_DIR="${GROWTH_APP_DIR:-$HOME/.growth-assistant/app}"
LABEL="com.growthassistant.bot"
KEEP_RELEASES=3

cd "$PROJECT_DIR"
npm ci --no-audit --no-fund
npm run check   # 타입 검사, 린트, 형식, 테스트 (DB 테스트에 Docker가 필요하다)
npm run build

release="$APP_DIR/releases/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$release"
cp -R dist package.json package-lock.json "$release/"
(cd "$release" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
ln -sfn "$release" "$APP_DIR/current"
echo "배포함: $release"

# 오래된 릴리스를 지운다 (current는 항상 가장 최근 것이다).
ls -1d "$APP_DIR"/releases/*/ | sort -r | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    rm -rf "$old"
done

if command -v launchctl >/dev/null && launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    echo "재시작함: $LABEL"
else
    echo "서비스가 아직 설치되지 않았다. ops/install.sh를 실행한다."
fi
