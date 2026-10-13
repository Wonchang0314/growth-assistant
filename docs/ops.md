# 운영 가이드 (Mac mini)

봇은 Mac mini M4 한 대에서 상시 실행한다 ([ADR-0010](adr/0010-local-mac-hosting.md)). 개발 PC는 개발·테스트용이다.

> **봇은 한 곳에서만 실행한다.** 같은 토큰으로 두 곳에서 띄우면 메시지에 두 번 답한다. Mac mini에서 운영을 시작하면 개발 PC에서는 `bootRun`을 쓰지 않거나, 쓰기 전에 Mac mini의 서비스를 멈춘다(`launchctl bootout`, 아래).

## 처음 설치

1. **준비물:** JDK 21(Temurin), Docker(Docker Desktop 또는 OrbStack), Git, `claude` CLI.
2. **Docker 자동 실행:** Docker 앱 설정에서 로그인할 때 시작하도록 켠다.
3. **`claude` 로그인:** 터미널에서 `claude`를 실행해 구독 계정으로 로그인한다. 확인:
   ```bash
   CLAUDE_LIVE=1 ./gradlew test --tests '*ClaudeCliLiveTest'
   ```
4. **레포와 설정:**
   ```bash
   git clone <레포> && cd growth-assistant
   cp .env.example .env   # 값 채우기. claude가 ~/.local/bin, /opt/homebrew/bin 밖에 있으면 CLAUDE_EXECUTABLE도 넣는다
   docker compose up -d
   ```
   DB 컨테이너는 `restart: unless-stopped`라서 한 번 띄워 두면 Docker가 시작할 때 함께 뜬다.
5. **서비스 등록:**
   ```bash
   ops/install.sh
   ```
   테스트를 포함해 빌드하고, jar를 `~/.growth-assistant/app/`에 복사한 뒤 launchd 사용자 에이전트(`com.growthassistant.bot`)로 등록한다. 로그인하면 시작하고, 죽으면 30초 뒤 다시 띄운다.
6. **확인:** `#관리`·`#튜터` 채널이 있고, `#튜터`에 질문을 남기면 스레드에서 답한다.

## 일상 작업

| 할 일 | 명령 |
|---|---|
| 새 코드 배포 | `git pull && ops/deploy.sh` (빌드·테스트 → jar 교체 → 재시작) |
| 상태 보기 | `launchctl print gui/$(id -u)/com.growthassistant.bot \| grep -E 'state\|pid\|last exit'` |
| 재시작 | `launchctl kickstart -k gui/$(id -u)/com.growthassistant.bot` |
| 멈추기 | `launchctl bootout gui/$(id -u)/com.growthassistant.bot` (다시 켜기: `ops/install.sh`) |
| 등록 해제 | `ops/uninstall.sh` |
| 로그 보기 | `tail -f ~/.growth-assistant/logs/growth-assistant.log` |

## 로그

| 파일 | 내용 |
|---|---|
| `~/.growth-assistant/logs/growth-assistant.log` | 앱 로그 (`ops` 프로필). 10MB마다 회전, 14일·총 500MB까지 보관 |
| `~/.growth-assistant/logs/launchd.err.log` | 로깅이 시작되기 전 실패 (JDK를 못 찾음, jar 없음 등) |
| `llm_call_log` 테이블 | Claude 호출마다 용도·모델·소요 시간·성공 여부·오류 |

## 문제 해결

- **`#관리`에 "Claude CLI 인증 오류" 알림:** Mac mini에서 `claude`를 실행해 다시 로그인한다. 재시작은 필요 없다. 다음 호출부터 정상으로 돌아온다.
- **봇이 오프라인:** `launchctl print`로 상태를 본다. `last exit code`가 계속 바뀌면 `launchd.err.log`와 앱 로그를 본다. DB가 안 떠 있으면 `docker compose up -d`.
- **`claude`를 찾지 못함 (`UNKNOWN: ... No such file`):** `which claude`로 경로를 찾아 `.env`에 `CLAUDE_EXECUTABLE=<경로>`를 넣고 재시작한다.

## Mac 설정

### 잠자기와 전원

예약 작업과 Discord 연결이 끊기지 않도록 잠자기를 끈다. 모니터는 꺼져도 된다.

```bash
sudo pmset -a sleep 0 displaysleep 10 autorestart 1 womp 1
pmset -g   # 확인
```

- `sleep 0`: 시스템 잠자기 끔
- `autorestart 1`: 정전 뒤 전원이 돌아오면 자동으로 켬
- `womp 1`: 네트워크로 깨우기

### FileVault와 재부팅

FileVault를 켜 두었다(2026-10-13 결정). 그래서 재부팅 뒤에는 **사용자가 로그인해야** Docker, `claude`, 봇이 동작한다. LaunchAgent는 로그인할 때 시작된다.

- 계획된 재시작은 `sudo fdesetup authrestart`로 한다. 다음 부팅에서 한 번 디스크 잠금을 자동으로 풀고 로그인한다.
- 정전 뒤에는 자동으로 복구되지 않는다. 켜진 뒤 직접(또는 화면 공유로) 로그인한다.

### 업데이트

macOS 자동 업데이트 설치는 끈다(시스템 설정 → 일반 → 소프트웨어 업데이트 → 자동 업데이트). 예고 없는 재부팅을 막는다. 업데이트는 직접 시간을 정해 설치한다.

### 원격 관리

- 시스템 설정 → 일반 → 공유에서 **원격 로그인(SSH)**과 **화면 공유**를 켠다.
- 집 밖에서 접속하려면 Tailscale을 쓴다. 봇은 Discord에 먼저 접속하는 방식이라 포트포워딩이 필요 없다.

## 백업

DB가 유일한 상태 저장소다. 필요할 때 덤프한다.

```bash
docker compose exec -T postgres pg_dump -U growth growth | gzip > ~/growth-$(date +%F).sql.gz
```

복원: `gunzip -c <파일> | docker compose exec -T postgres psql -U growth growth` (빈 DB에서).
