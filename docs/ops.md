# 운영 가이드 (Mac mini)

Mac mini M4 한 대에서 운영한다 ([ADR-0010](adr/0010-local-mac-hosting.md)). 개발 PC는 개발·테스트용이다. 지금은 상시 실행 프로세스가 없다. MCP 서버는 Claude Desktop이 배포된 릴리스에서 필요할 때 띄우고 끈다 ([ADR-0018](adr/0018-claude-mcp-server.md)). 서버 예약 작업이 생기는 4단계에서 launchd 상시 실행 앱을 다시 만든다.

## 처음 설치

1. **준비물:** Node.js(버전은 `.nvmrc`. nvm이면 레포에서 `nvm install`), Docker(Docker Desktop 또는 OrbStack), Git, `claude` CLI, Claude Desktop.
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
   검사·테스트·빌드한 릴리스를 `~/.growth-assistant/app/releases/<시각>`에 만들고, DB 마이그레이션과 시드 개념 적재를 한 뒤 `~/.growth-assistant/app/current`를 새 릴리스로 바꾼다.
6. **예전 Discord 봇 해제:** 예전에 `ops/install.sh`로 봇을 등록했던 기기라면 `ops/uninstall.sh`를 한 번 실행한다.
7. **Claude Desktop 등록:**
   ```bash
   ops/desktop-config.sh
   ```
   Desktop 설정 파일에 넣을 항목을 출력한다(파일은 고치지 않는다). 출력 예:
   ```json
   {
     "mcpServers": {
       "growth-assistant": {
         "command": "/Users/<사용자>/.growth-assistant/app/node",
         "args": ["/Users/<사용자>/.growth-assistant/app/current/dist/mcp-stdio.js"],
         "env": {
           "GROWTH_ENV_FILE": "/Users/<사용자>/<레포>/.env",
           "LOG_DIR": "/Users/<사용자>/.growth-assistant/logs"
         }
       }
     }
   }
   ```
   - Desktop의 Settings → Developer → Edit Config로 `~/Library/Application Support/Claude/claude_desktop_config.json`을 열고, `mcpServers`에 `growth-assistant` 항목을 더한다. 다른 서버가 이미 있으면 그 옆에 넣는다.
   - Desktop을 완전히 종료(⌘Q)했다가 다시 연다. Settings → Developer에서 `growth-assistant`가 running이면 연결된 것이다.
   - 경로를 모두 절대 경로로 적는 이유: Desktop은 셸을 거치지 않고 macOS가 띄우므로 터미널의 PATH(nvm이 바꾼 것 포함)와 작업 디렉터리를 물려받지 않는다. `command`는 배포가 바꾸는 `app/node` 링크를, `args`는 `current` 링크를 가리키므로 새로 배포한 뒤에는(node 버전을 바꿨어도) Desktop을 다시 시작하기만 하면 된다.
   - `LOG_DIR`는 `.env`가 아니라 여기서 준다. 진입점이 `.env`를 읽기 전에 로거를 만들기 때문이다.
   - 튜터링은 Claude 프로젝트를 하나 만들고, 그 지침에 `docs/claude-project-instructions.md`의 본문을 붙여 넣은 뒤 그 안에서 대화한다.
8. **점검:** [수동 점검 체크리스트](manual-check.md)의 1단계 항목을 확인한다.

## 일상 작업

| 할 일 | 명령 |
|---|---|
| 새 코드 배포 | `git pull && ops/deploy.sh` (의존성 설치 → 검사·테스트 → 빌드 → 새 릴리스 → 마이그레이션 → 시드 적재 → `current` 교체) 후 Claude Desktop 다시 시작. 릴리스는 최근 3개를 남긴다 |
| Node 버전 올리기 | `.nvmrc`를 고쳐 머지한 뒤 `git pull && nvm install && ops/deploy.sh` → Claude Desktop 다시 시작. 배포는 `node --version`이 `.nvmrc`와 다르면 멈추고, `app/node` 링크를 새 node로 바꾼다. `package.json`의 `engines`와 `.npmrc`의 `engine-strict` 때문에 범위 밖 버전에서는 `npm ci`가 실패한다 |
| 이전 릴리스로 되돌리기 | `ls ~/.growth-assistant/app/releases` 후 `ln -sfn ~/.growth-assistant/app/releases/<이전> ~/.growth-assistant/app/current` → Claude Desktop 다시 시작. DB 마이그레이션은 되돌리지 않으므로 스키마가 바뀐 릴리스 사이에서는 쓰지 않는다 |
| 마이그레이션만 적용 | `npm run db:migrate` (작업 트리의 `.env` 기준) |
| 시드 개념만 적재 | `npm run db:seed` (작업 트리의 `.env` 기준). 시드 YAML을 고친 뒤. 개념은 이름으로 찾아 트랙·별칭·설명을 고치고, 승인 상태는 건드리지 않으며, 시드 개념끼리의 관계는 YAML대로 맞추고, YAML에서 빠진 시드 개념(관계 포함)과 트랙은 지운다. 학습 기록이 연결된 개념을 지우려 하면 적재 전체가 취소된다 |
| Notion 동기화 | `npm run sync` (작업 트리의 `.env` 기준, `NOTION_TOKEN`과 `NOTION_ROOT_IDS`가 필요하다). 처음 실행은 백필이라 20분 남짓 걸리고, 그 뒤로는 Notion 수정 시각이 바뀐 문서만 읽는다. 실패한 문서는 다음 실행이 다시 읽는다. 상태는 Desktop에서 `sync_status` 도구로 본다 |
| 경험 카드 추출 | `npm run extract` (작업 트리의 `.env` 기준). 동기화한 뒤 아직 뽑지 않았거나 실패한 문서마다 `claude -p`(Sonnet)를 한 번 부른다. 구독 사용량을 쓰므로 `-- --limit 5`로 나눠 돌릴 수 있고, 한도에 걸리면 남은 문서를 그대로 두고 멈춘다. 프롬프트를 고친 뒤 특정 문서를 다시 뽑으려면 `-- --ids 3,7`. 추출이 만든 승인 대기 개념은 Desktop에서 "승인 대기 개념 보여줘"로 검토한다(`list_pending_concepts`, `review_concept`) |
| MCP 로그 보기 | `tail -F <LOG_DIR>/mcp/current.log` (`LOG_DIR`를 주지 않았으면 Claude Desktop의 MCP 로그에 남는다) |

## 로그

| 위치 | 내용 |
|---|---|
| `LOG_DIR/mcp/growth-assistant.<날짜>.<번호>.log` | MCP 서버 로그 (Claude Desktop 설정에서 `LOG_DIR`를 줬을 때). 하루 또는 10MB마다 새 파일, 최근 30개 보관. `current.log`가 지금 쓰는 파일을 가리킨다 |
| Claude Desktop의 MCP 로그 (`~/Library/Logs/Claude/mcp-server-growth-assistant.log`) | `LOG_DIR`가 없을 때의 로그와 시작 실패(환경 변수 오류, node를 찾지 못함) |
| `llm_call_log` 테이블 | Claude CLI 호출마다 용도·모델·소요 시간·성공 여부·오류 |

## 문제 해결

- **로그에 "Claude CLI 인증 오류" 관리 알림:** Mac mini에서 `claude`를 실행해 다시 로그인한다. 다음 호출부터 정상으로 돌아온다. 알림 경로는 원격 전환 때 정한다(ADR-0018).
- **Desktop에 서버가 failed로 보이거나 도구가 없음:** Desktop의 MCP 로그를 본다. `ops/desktop-config.sh`를 다시 실행해 설정의 경로가 맞는지 비교한다. 설정 파일이 JSON 형식에 맞지 않으면 Desktop이 서버를 하나도 띄우지 않는다.
- **`.env`를 읽지 못함(`EPERM`):** 레포가 `~/Documents`, `~/Desktop`, `~/Downloads` 아래에 있으면 macOS 개인정보 보호가 Desktop이 띄운 프로세스의 접근을 막을 수 있다. 레포를 그 밖(예: `~/dev`)으로 옮기거나 시스템 설정 → 개인정보 보호 및 보안에서 Claude에 접근을 허용한다.
- **도구가 오류를 돌려줌:** 오류 문장의 "원인"을 본다. `ECONNREFUSED`면 DB가 안 떠 있으니 `docker compose up -d`. `relation ... does not exist`처럼 테이블이 없으면 마이그레이션이 덜 된 것이니 `ops/deploy.sh`나 `npm run db:migrate`.
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
