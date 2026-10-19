# ops/ 스크립트가 함께 쓰는 경로와 LaunchAgent 이름. 실행하지 않고 source로 읽는다.
# 배포 위치·로그 위치를 바꿔 시험할 때만 GROWTH_APP_DIR, GROWTH_LOG_DIR을 지정한다.
APP_DIR="${GROWTH_APP_DIR:-$HOME/.growth-assistant/app}"
LOG_DIR="${GROWTH_LOG_DIR:-$HOME/.growth-assistant/logs}"

# 상시 실행 MCP HTTP 서버(ADR-0035). 사용자 에이전트라 로그인해야 뜬다.
AGENT_LABEL="com.growthassistant.server"
AGENT_TARGET="gui/$(id -u)/$AGENT_LABEL"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"

# 에이전트가 launchd에 올라가 있으면 참이다.
agent_loaded() {
    launchctl print "$AGENT_TARGET" >/dev/null 2>&1
}

# 에이전트를 내리고, launchd가 다 내릴 때까지 기다린다(바로 다시 올리면 bootstrap이 실패할 수 있다).
agent_bootout() {
    agent_loaded || return 0
    launchctl bootout "$AGENT_TARGET" 2>/dev/null || true
    for _ in {1..20}; do
        agent_loaded || return 0
        sleep 0.5
    done
    echo "에이전트가 내려가지 않는다: $AGENT_TARGET" >&2
    return 1
}
