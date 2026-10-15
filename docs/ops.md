# 운영 가이드 (Mac mini)

Mac mini M4 한 대에서 운영한다 ([ADR-0010](adr/0010-local-mac-hosting.md)). 개발 PC는 개발·테스트용이다. 지금은 상시 실행 프로세스가 없다. MCP 서버는 Claude Desktop이 배포된 릴리스에서 필요할 때 띄우고 끈다 ([ADR-0018](adr/0018-claude-mcp-server.md)). 서버 예약 작업이 생기는 4단계에서 launchd 상시 실행 앱을 다시 만든다.

## 처음 설치

1. **준비물:** Node.js 24(`brew install node@24`), Docker(Docker Desktop 또는 OrbStack), Git, `claude` CLI, Claude Desktop.
2. **Docker 자동 실행:** Docker 앱 설정에서 로그인할 때 시작하도록 켠다.
3. **`claude` 로그인:** 터미널에서 `claude`를 실행해 구독 계정으로 로그인한다. 확인:
   ```bash
   npm ci && CLAUDE_LIVE=1 npx vitest run claude-cli.live
   ```
4. **레포와 설정:**
   ```bash
   git clone <레포> && cd growth-assistant
   cp .env.example .env   # 값 채우기. claude가 ~/.local/bin, /opt/homebrew/bin 밖에 있으면 CLAUDE_EXECUTABLE도 넣는다
   docker compose up -d
   ```
   DB 컨테이너는 `restart: unless-stopped`라서 한 번 띄워 두면 Docker가 시작할 때 함께 뜬다.
   Kotlin 버전을 실행한 적이 있는 기기라면 DB에 Flyway 테이블이 남아 있어 마이그레이션이 실패한다. 운영 데이터가 없으면 `docker compose down -v`로 볼륨을 지우고 다시 띄운다.
5. **배포:**
   ```bash
   ops/deploy.sh
   ```
   검사·테스트·빌드한 릴리스를 `~/.growth-assistant/app/releases/<시각>`에 만들고, DB 마이그레이션을 적용한 뒤 `~/.growth-assistant/app/current`를 새 릴리스로 바꾼다.
6. **예전 Discord 봇 해제:** 예전에 `ops/install.sh`로 봇을 등록했던 기기라면 `ops/uninstall.sh`를 한 번 실행한다.
7. **Claude Desktop 등록:** (작성 예정, 로드맵 1단계)

## 일상 작업

| 할 일 | 명령 |
|---|---|
| 새 코드 배포 | `git pull && ops/deploy.sh` (의존성 설치 → 검사·테스트 → 빌드 → 새 릴리스 → 마이그레이션 → `current` 교체) 후 Claude Desktop 다시 시작. 릴리스는 최근 3개를 남긴다 |
| 이전 릴리스로 되돌리기 | `ls ~/.growth-assistant/app/releases` 후 `ln -sfn ~/.growth-assistant/app/releases/<이전> ~/.growth-assistant/app/current` → Claude Desktop 다시 시작. DB 마이그레이션은 되돌리지 않으므로 스키마가 바뀐 릴리스 사이에서는 쓰지 않는다 |
| 마이그레이션만 적용 | `npm run db:migrate` (작업 트리의 `.env` 기준) |
| MCP 로그 보기 | `tail -F <LOG_DIR>/mcp/current.log` (`LOG_DIR`를 주지 않았으면 Claude Desktop의 MCP 로그에 남는다) |

## 로그

| 위치 | 내용 |
|---|---|
| `LOG_DIR/mcp/growth-assistant.<날짜>.<번호>.log` | MCP 서버 로그 (Claude Desktop 설정에서 `LOG_DIR`를 줬을 때). 하루 또는 10MB마다 새 파일, 최근 30개 보관. `current.log`가 지금 쓰는 파일을 가리킨다 |
| Claude Desktop의 MCP 로그 | `LOG_DIR`가 없을 때의 로그와 시작 실패(환경 변수 오류, DB 연결 실패) |
| `llm_call_log` 테이블 | Claude CLI 호출마다 용도·모델·소요 시간·성공 여부·오류 |

## 문제 해결

- **로그에 "Claude CLI 인증 오류" 관리 알림:** Mac mini에서 `claude`를 실행해 다시 로그인한다. 다음 호출부터 정상으로 돌아온다. 알림 경로는 원격 전환 때 정한다(ADR-0018).
- **도구가 오류를 돌려줌:** DB가 안 떠 있으면 `docker compose up -d`. 마이그레이션이 덜 됐으면 `ops/deploy.sh`나 `npm run db:migrate`.
- **`claude`를 찾지 못함 (`UNKNOWN: Error: spawn claude ENOENT`):** `which claude`로 경로를 찾아 `.env`에 `CLAUDE_EXECUTABLE=<경로>`를 넣는다.

## Mac 설정

### 잠자기와 전원

Claude Desktop과 (4단계부터) 예약 작업이 멈추지 않도록 잠자기를 끈다. 모니터는 꺼져도 된다.

```bash
sudo pmset -a sleep 0 displaysleep 10 autorestart 1 womp 1
pmset -g   # 확인
```

- `sleep 0`: 시스템 잠자기 끔
- `autorestart 1`: 정전 뒤 전원이 돌아오면 자동으로 켬
- `womp 1`: 네트워크로 깨우기
- 본체 전원 버튼을 짧게 누르면 잠자기에 들어간다(`Sleep On Power Button 1`). 모니터 전원만 끈다.

### FileVault와 재부팅

FileVault를 켜 두었다(2026-10-13 결정). 그래서 재부팅 뒤에는 **사용자가 로그인해야** Docker, `claude`, Claude Desktop이 동작한다.

- 계획된 재시작은 `sudo fdesetup authrestart`로 한다. 다음 부팅에서 한 번 디스크 잠금을 자동으로 풀고 로그인한다.
- 정전 뒤에는 자동으로 복구되지 않는다. 켜진 뒤 직접(또는 화면 공유로) 로그인한다.

### 업데이트

macOS 자동 업데이트 설치는 끈다(시스템 설정 → 일반 → 소프트웨어 업데이트 → 자동 업데이트). 예고 없는 재부팅을 막는다. 업데이트는 직접 시간을 정해 설치한다.

### 원격 관리

- 시스템 설정 → 일반 → 공유에서 **원격 로그인(SSH)**과 **화면 공유**를 켠다.
- 집 밖에서 접속하려면 Tailscale을 쓴다. 지금은 외부에 여는 포트가 없다.

## 백업

DB가 유일한 상태 저장소다. 필요할 때 덤프한다.

```bash
docker compose exec -T postgres pg_dump -U growth growth | gzip > ~/growth-$(date +%F).sql.gz
```

복원: `gunzip -c <파일> | docker compose exec -T postgres psql -U growth growth` (빈 DB에서).
