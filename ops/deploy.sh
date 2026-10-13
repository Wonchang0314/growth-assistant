#!/usr/bin/env bash
# 빌드(테스트 포함)한 jar를 운영 위치로 복사하고, 서비스가 설치돼 있으면 재시작한다.
# 실행 중인 jar를 덮어쓰지 않도록 build/ 밖으로 복사해 둔다.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$HOME/.growth-assistant/app"
LABEL="com.growthassistant.bot"

cd "$PROJECT_DIR"
./gradlew build

mkdir -p "$APP_DIR"
jar="$(ls build/libs/*.jar | grep -v -- '-plain\.jar$')"
cp "$jar" "$APP_DIR/growth-assistant.jar.new"
mv "$APP_DIR/growth-assistant.jar.new" "$APP_DIR/growth-assistant.jar"
echo "복사함: $jar -> $APP_DIR/growth-assistant.jar"

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    echo "재시작함: $LABEL"
else
    echo "서비스가 아직 설치되지 않았다. ops/install.sh를 실행한다."
fi
