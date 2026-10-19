# 운영 가이드 (Mac mini)

Mac mini M4 한 대에서 운영한다 ([ADR-0010](adr/0010-local-mac-hosting.md)). 개발 PC는 개발·테스트용이다. Claude 앱(웹·Desktop·모바일)은 원격 커스텀 커넥터 `https://mcp.seok.app/mcp`로 붙는다. 그 바탕인 MCP HTTP 서버는 launchd 사용자 에이전트로 상시 실행하고, Cloudflare 터널로 공개한다 ([ADR-0035](adr/0035-remote-connector.md), 아래 "상시 실행"). 로컬 MCP 서버(stdio)는 원격이 안 될 때 Claude Desktop에 대신 붙이는 용도로 남겨 둔다 ([ADR-0018](adr/0018-claude-mcp-server.md), 2026-10-20 Desktop 설정에서 뺐다).

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
6. **(선택) Claude Desktop 로컬 등록:** 원격 커넥터를 쓰면 하지 않는다. 같은 도구가 두 번 보이기 때문이다. 원격이 안 될 때만 쓴다(2026-10-20 맥미니 Desktop 설정에서 뺐고, 원래 설정은 `claude_desktop_config.json.bak-20261020-remote`).
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
7. **상시 실행 서버 등록:** `ops/install.sh`. MCP HTTP 서버를 LaunchAgent로 등록해 바로 띄운다(아래 "상시 실행"). 공개 경로는 아래 "공개 경로 (Cloudflare 터널, WAF)", 커넥터 추가는 "OAuth"의 "커넥터 추가".
   - 튜터링은 Claude 프로젝트를 하나 만들고, 그 지침에 `docs/claude-project-instructions.md`의 본문을 붙여 넣은 뒤 그 안에서 대화한다.
8. **점검:** [수동 점검 체크리스트](manual-check.md)의 1단계 항목을 확인한다.

## 일상 작업

| 할 일 | 명령 |
|---|---|
| 새 코드 배포 | `git pull && ops/deploy.sh` (의존성 설치 → 검사·테스트 → 빌드 → 새 릴리스 → 마이그레이션 → 시드 적재 → `current` 교체 → 상시 실행 서버 다시 띄우기) 후 Claude Desktop 다시 시작. 상시 실행 서버는 등록돼 있을 때만 배포가 다시 띄운다. 릴리스는 최근 3개를 남긴다 |
| Node 버전 올리기 | `.nvmrc`를 고쳐 머지한 뒤 `git pull && nvm install && ops/deploy.sh` → (로컬 등록을 쓸 때만) Claude Desktop 다시 시작. 배포는 `node --version`이 `.nvmrc`와 다르면 멈추고, `app/node` 링크를 새 node로 바꾼다. `package.json`의 `engines`와 `.npmrc`의 `engine-strict` 때문에 범위 밖 버전에서는 `npm ci`가 실패한다 |
| 이전 릴리스로 되돌리기 | `ls ~/.growth-assistant/app/releases` 후 `ln -sfn ~/.growth-assistant/app/releases/<이전> ~/.growth-assistant/app/current` → `launchctl kickstart -k gui/$(id -u)/com.growthassistant.server`(상시 실행 서버) → (로컬 등록을 쓸 때만) Claude Desktop 다시 시작. DB 마이그레이션은 되돌리지 않으므로 스키마가 바뀐 릴리스 사이에서는 쓰지 않는다 |
| 마이그레이션만 적용 | `npm run db:migrate` (작업 트리의 `.env` 기준) |
| 시드 개념만 적재 | `npm run db:seed` (작업 트리의 `.env` 기준). 시드 YAML을 고친 뒤. 개념은 이름으로 찾아 트랙·별칭·설명을 고치고, 승인 상태는 건드리지 않으며, 시드 개념끼리의 관계는 YAML대로 맞추고, YAML에서 빠진 시드 개념(관계 포함)과 트랙은 지운다. 학습 기록이 연결된 개념을 지우려 하면 적재 전체가 취소된다 |
| Notion 동기화 | `npm run sync` (작업 트리의 `.env` 기준, `NOTION_TOKEN`과 `NOTION_ROOT_IDS`가 필요하다). 처음 실행은 백필이라 20분 남짓 걸리고, 그 뒤로는 Notion 수정 시각이 바뀐 문서만 읽는다. 실패한 문서는 다음 실행이 다시 읽는다. 상태는 Desktop에서 `sync_status` 도구로 본다 |
| 경험 카드 추출 | `npm run extract` (작업 트리의 `.env` 기준). 동기화한 뒤 아직 뽑지 않았거나 실패한 문서마다 `claude -p`(Sonnet)를 한 번 부른다. 구독 사용량을 쓰므로 `-- --limit 5`로 나눠 돌릴 수 있고, 한도에 걸리면 남은 문서를 그대로 두고 멈춘다. 프롬프트를 고친 뒤 특정 문서를 다시 뽑으려면 `-- --ids 3,7`. 추출이 만든 승인 대기 개념은 Desktop에서 "승인 대기 개념 보여줘"로 검토한다(`list_pending_concepts`, `review_concept`) |
| 판단 사례 추상화 | `npm run abstract` (작업 트리의 `.env` 기준). 경험 카드를 40장씩 선별(Sonnet)하고, 판단이 분명한 카드마다 치환(Sonnet)·패턴 게이트·독립 검증(Opus)을 거쳐 `decision_case`에 저장한다. 경험 사례가 두 번 다 걸리면 가정 사례(Sonnet)·정답을 숨긴 풀이 검증(Opus)으로 폴백하고, 그것도 걸리면 PENDING으로 둔다(ADR-0026). 사용량이 크므로 `-- --limit 10`으로 나눠 돌리고, 프롬프트를 고친 뒤 특정 카드를 다시 하려면 `-- --ids 3,7`(경험 카드 id). 한도에 걸리면 남은 카드를 두고 멈춘다 |
| MCP 로그 보기 | `tail -F <LOG_DIR>/mcp/current.log` (`LOG_DIR`를 주지 않았으면 Claude Desktop의 MCP 로그에 남는다). 상시 실행 서버는 `tail -F ~/.growth-assistant/logs/mcp-http/current.log` |
| 상시 실행 서버 상태·재시작 | 아래 "상시 실행" |

## 상시 실행 (MCP HTTP 서버)

원격 커넥터의 바탕인 MCP HTTP 서버(`dist/mcp-http.js`, 기본 `127.0.0.1:3100`)를 launchd 사용자 에이전트 `com.growthassistant.server`로 상시 실행한다([ADR-0035](adr/0035-remote-connector.md)). 템플릿은 `ops/com.growthassistant.server.plist`다.

- **실행하는 것:** `~/.growth-assistant/app/node`(배포가 바꾸는 node 링크)로 `~/.growth-assistant/app/current/dist/mcp-http.js`를 띄운다. Desktop 설정과 같은 방식이라 node 버전을 올려도 다시 등록하지 않는다. `.env`는 `GROWTH_ENV_FILE`(레포의 `.env`)로 읽고, 주소는 `.env`의 `MCP_HTTP_HOST`·`MCP_HTTP_PORT`다.
- **다시 띄우기:** `RunAtLoad`로 로그인하면 시작하고, `KeepAlive`로 어떤 이유로 끝나든 다시 띄운다. 시작 실패가 되풀이되면 `ThrottleInterval` 10초에 한 번만 다시 띄운다.
- **`PATH`:** launchd의 기본 `PATH`에는 `claude`가 없어서 plist에 `~/.local/bin:/opt/homebrew/bin:/usr/local/bin`을 앞에 둔다. 그 밖에 있으면 `.env`에 `CLAUDE_EXECUTABLE`을 넣는다(`ops/install.sh`가 못 찾으면 알려 준다).

| 할 일 | 명령 |
|---|---|
| 등록(처음, 템플릿·`.env` 위치·로그 위치를 바꾼 뒤) | `ops/install.sh`. 배포된 릴리스가 있어야 한다(`ops/deploy.sh` 먼저). plist를 `~/Library/LaunchAgents/com.growthassistant.server.plist`로 만들고, 이미 등록돼 있으면 내렸다가 다시 올린다. 처음 등록하면 macOS가 "백그라운드 항목이 추가됨" 알림을 띄운다. 시스템 설정 → 일반 → 로그인 항목 및 확장 프로그램의 "백그라운드에서 허용"에서 node가 꺼져 있으면 켠다 |
| 해제 | `ops/uninstall.sh`. 에이전트를 내리고 plist를 지운다. 릴리스와 로그는 남는다 |
| 새 릴리스로 바꾸기 | `ops/deploy.sh`가 `current`를 바꾼 뒤 `launchctl kickstart -k`로 다시 띄운다. 등록하지 않았으면 건너뛴다 |
| 상태 확인 | `launchctl print gui/$(id -u)/com.growthassistant.server \| grep -E 'state\|pid\|runs\|last exit'`. `state = running`이면 떠 있고, `runs`가 계속 늘면 시작에 실패해 되풀이되는 중이다. 포트는 `lsof -nP -iTCP:3100 -sTCP:LISTEN` |
| 다시 띄우기 | `launchctl kickstart -k gui/$(id -u)/com.growthassistant.server` |
| 잠깐 멈추기 | `ops/uninstall.sh`(`KeepAlive`라 프로세스만 죽이면 다시 뜬다). 다시 쓰려면 `ops/install.sh` |
| 로그 | `tail -F ~/.growth-assistant/logs/mcp-http/current.log`. 시작하자마자 죽으면 `~/.growth-assistant/logs/launchd/server.err.log` |

- **재부팅 뒤:** 사용자 에이전트라 로그인해야 뜬다. FileVault가 켜져 있어 재부팅 뒤에는 디스크 암호를 풀고 로그인할 때까지 서버·DB(OrbStack)·터널이 모두 멈춘다(아래 "FileVault와 재부팅"). 화면 잠금이나 모니터 끄기로는 멈추지 않고, 로그아웃하면 멈춘다.
- **DB보다 먼저 뜰 때:** 로그인하면 서버와 OrbStack이 함께 시작해 서버가 먼저 뜰 수 있다. 서버는 시작할 때 DB에 연결하지 않고 요청마다 연결하므로 그대로 떠 있고, DB가 뜨기 전 도구 호출은 `ECONNREFUSED`로 실패했다가 DB가 뜨면 저절로 돌아온다. 떠 있는 동안 DB가 재시작돼 프로세스가 죽어도 `KeepAlive`가 10초 뒤 다시 띄운다.
- **수동 실행과 겹칠 때:** 에이전트가 떠 있으면 같은 포트로 `npm run mcp:http`를 띄울 수 없다(`EADDRINUSE`). 개발 중에는 `.env`나 셸에서 `MCP_HTTP_PORT`를 바꿔 띄운다.

### OAuth (원격 커넥터 인증)

`/mcp`는 OAuth 액세스 토큰이 있어야 답한다(없으면 `401`). 서버가 인가 서버를 겸하고, 본인 확인은 구글 로그인 + 이메일 허용 목록이다([ADR-0035](adr/0035-remote-connector.md), 설계 문서 7.7). 아래 환경 변수가 하나라도 없으면 HTTP 서버가 시작하지 않는다(stdio 서버와 CLI는 쓰지 않는다). 값은 로그에 남기지 않는다.

| 환경 변수 | 값 |
|---|---|
| `PUBLIC_BASE_URL` | 바깥에서 닿는 주소 `https://mcp.seok.app`. OAuth issuer이고, Claude에 넣는 MCP URL은 여기에 `/mcp`를 붙인 `https://mcp.seok.app/mcp`다. 로컬에서 시험할 때는 `http://localhost:3100` |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud의 OAuth 클라이언트(웹 애플리케이션). 리디렉트 URI는 `<PUBLIC_BASE_URL>/oauth/google/callback`(운영 `https://mcp.seok.app/…`, 개발 `http://localhost:3100/…`) |
| `OAUTH_ALLOWED_EMAILS` | 로그인을 허용할 구글 이메일(쉼표 구분). 구글이 확인한(`email_verified`) 이메일만 받는다 |
| `OAUTH_CLIENT_ID_HOSTS` | 선택. CIMD `client_id` URL로 받을 호스트(쉼표 구분, 기본 `claude.ai`). 이 호스트의 https 문서만 가져온다 |

- **첫 연결:** 서버 로그에 `처음 보는 client_id: …`(받은 것)나 `허용하지 않는 client_id: …`(거절한 것)가 남는다. 호스팅 앱의 client_id 호스트가 `claude.ai`가 아니면 `OAUTH_CLIENT_ID_HOSTS`에 더한다. 2026-10-20 claude.ai 웹에서 연결할 때 받은 값은 `https://claude.ai/oauth/mcp-oauth-client-metadata`(redirect_uri `https://claude.ai/api/mcp/auth_callback`)이고 기본값 그대로 됐다.
- **커넥터 추가:** claude.ai **웹**에서 설정 → Connectors → Add custom connector, URL `https://mcp.seok.app/mcp`(고급 설정은 비움) → Connect → 구글 로그인 → 동의 화면에서 허용. 웹에서 붙이면 Desktop·모바일에도 뜬다.
- **토큰:** 액세스 토큰 1시간, 리프레시 토큰 90일(갱신할 때마다 회전해 새로 90일). 90일 동안 쓰지 않으면 Claude에서 다시 연결한다. 이미 회전한 리프레시 토큰이 다시 오면 그 연결의 토큰을 모두 폐기하고 운영 알림을 보낸다(아래 "운영 알림", 로그 `[관리 알림]`). 그러면 Claude에서 다시 연결해야 한다.
- **로컬에서 흐름 시험:** `.env`의 `PUBLIC_BASE_URL=http://localhost:3100`으로 `npm run build && npm run mcp:http`를 띄우고(상시 실행 서버가 3100을 쓰면 `ops/uninstall.sh`로 잠깐 내린다), Claude Code에서 `claude mcp add --transport http growth-local http://localhost:3100/mcp` → `/mcp`에서 인증하면 브라우저로 구글 로그인 → 동의 화면 → 도구 목록까지 이어진다. Claude Code의 CIMD 문서(`https://claude.ai/oauth/claude-code-client-metadata`)가 루프백 리디렉트(`http://localhost/callback`, 포트는 아무거나)를 쓰므로 허용 호스트 기본값 그대로 된다. 끝나면 `claude mcp remove growth-local`.
- **로그인을 끊고 싶을 때:** 아직 도구가 없다. DB에서 `UPDATE oauth_grant SET revoked_at = now() WHERE revoked_at IS NULL;`로 모든 연결을 폐기한다.

### 공개 경로 (Cloudflare 터널, WAF)

`https://mcp.seok.app`은 Cloudflare 이름 있는 터널로 이 Mac의 `127.0.0.1:3100`에 닿는다(ADR-0035). 맥미니의 `cloudflared`가 Cloudflare로 밖으로 나가는 연결을 맺으므로 공유기 포트를 열지 않는다. 도메인 `seok.app`의 DNS는 Cloudflare에 있다.

- **터널:** 이름 `growth-assistant`(ID `d6c8e11b-e168-4172-9323-6b8f58d94fd8`). 설정 `~/.cloudflared/config.yml`(ingress: `mcp.seok.app` → `http://127.0.0.1:3100`, 나머지 404), 자격 파일 `~/.cloudflared/<ID>.json`과 `~/.cloudflared/cert.pem`은 비밀이다. DNS `mcp` CNAME은 `cloudflared tunnel route dns growth-assistant mcp.seok.app`으로 만들었다.
- **처음 만들기(다른 기기에서 다시 할 때):** `brew install cloudflared` → `cloudflared tunnel login`(도메인 선택) → `cloudflared tunnel create growth-assistant` → `config.yml` 작성 → `cloudflared tunnel ingress validate` → `cloudflared tunnel route dns …` → `cloudflared tunnel run growth-assistant`로 시험 → 상시 실행 등록. Homebrew가 안내하는 `brew services start cloudflared`는 터널 인자 없이 띄우므로 쓰지 않는다.
- **상시 실행:** `cloudflared service install`(sudo 없이)로 LaunchAgent `com.cloudflare.cloudflared`가 생긴다. 로그인해야 뜬다(서버와 같은 조건). **함정:** 이렇게 만든 plist는 `ProgramArguments`가 `cloudflared` 하나뿐이라 터널을 띄우지 않고(로그에 "use `cloudflared tunnel run`" 반복, 공개 주소 530) 종료를 되풀이한다. `~/Library/LaunchAgents/com.cloudflare.cloudflared.plist`의 `ProgramArguments`에 `tunnel`, `run`을 더하고 `launchctl bootout gui/$(id -u)/com.cloudflare.cloudflared` → `launchctl bootstrap gui/$(id -u) <plist>`로 다시 올린다(2026-10-20에 고침, 원본 `.bak-20261020`). `cloudflared service install`을 다시 하면 이 수정이 사라진다.
- **로그:** `~/Library/Logs/com.cloudflare.cloudflared.{out,err}.log`. 공개 주소가 502면 터널은 붙었고 서버가 꺼진 것, 530이면 터널이 안 붙은 것이다.
- **WAF:** Cloudflare 대시보드 → `seok.app` → Security rules → Custom rules에 규칙 하나(무료 플랜). `/mcp`·`/token`은 Anthropic 외부 요청 대역에서만 받고, `/authorize`·구글 콜백·메타데이터·`/healthz`는 브라우저와 외부 헬스체크가 쓰므로 열어 둔다. Action은 Block.
  ```
  (http.host eq "mcp.seok.app" and http.request.uri.path in {"/mcp" "/mcp/" "/token"} and not ip.src in {160.79.104.0/21})
  ```
  확인: 이 Mac에서 `curl -X POST https://mcp.seok.app/token`이 Cloudflare 차단 페이지(403 "Sorry, you have been blocked")면 동작한다. Anthropic이 대역을 바꾸면([IP 주소 문서](https://platform.claude.com/docs/en/api/ip-addresses)) 이 규칙을 고친다.
- **Bot Fight Mode는 끈다.** 켜면 Anthropic 서버의 요청을 봇으로 막을 수 있다.

### 운영 알림 (ntfy, 외부 헬스체크)

운영 문제는 [ntfy](https://ntfy.sh)로 휴대폰에 알리고, 서버가 죽은 것은 외부 헬스체크(UptimeRobot)가 `/healthz`를 보고 알린다.

| 환경 변수 | 값 |
|---|---|
| `NTFY_TOPIC` | 알림을 보낼 토픽 이름. 토픽을 아는 사람은 누구나 구독·발행할 수 있으니 추측하기 어렵게 짓고 남에게 보이지 않는다. 없으면 알림 없이 로그(`[관리 알림]`)만 남긴다(stdio 서버, CLI, 테스트) |
| `NTFY_URL` | 선택. ntfy 서버 주소(기본 `https://ntfy.sh`) |

- **구독:** 휴대폰에 ntfy 앱(iOS·Android)을 설치하고 + → 토픽 이름을 넣어 구독한다. 토픽은 이 Mac에서 `grep NTFY_TOPIC .env`로 본다. 서버 주소를 바꿨으면 구독할 때 "다른 서버 사용"에 `NTFY_URL`을 넣는다. `.env`를 고친 뒤에는 `launchctl kickstart -k gui/$(id -u)/com.growthassistant.server`로 다시 띄운다.
- **알리는 것:** 리프레시 토큰 재사용으로 연결을 폐기했을 때, 허용 목록에 없거나 구글이 확인하지 않은 계정이 로그인을 시도했을 때, Claude CLI 인증 오류(다시 성공할 때까지 한 번). 5단계 예약 작업 실패도 같은 경로로 더한다. 서버 시작·재시작과 일반 도구 오류는 알리지 않는다(`KeepAlive`가 다시 띄울 때마다 울리지 않게).
- **묶기:** 같은 종류는 1시간에 한 번만 보낸다. 그 사이 생긴 건수는 1시간이 지나 처음 오는 같은 종류 알림에 "외 N건"으로 붙는다. 묶기 상태는 프로세스 메모리라 서버를 다시 띄우면 처음부터 센다.
- **알림 내용:** 제목(종류)과 시각, 건수만 보낸다. ntfy.sh 공용 서버를 평문으로 지나가므로 이메일·토큰 계열 ID 같은 자세한 내용은 보내지 않고 서버 로그의 `[관리 알림]` 줄에만 남긴다. 알림을 받으면 로그(`~/.growth-assistant/logs/mcp-http/current.log`)를 본다.
- **ntfy 전송 실패:** 로그에 `ntfy 전송 실패`만 남기고 원래 요청은 그대로 처리한다(5초 타임아웃).
- **서버 다운 감시 (UptimeRobot, 2026-10-20 등록):** UptimeRobot 무료 계정 → New monitor → HTTP(s), URL `https://mcp.seok.app/healthz`, 간격 5분 → 알림 연락처(앱 푸시나 이메일)를 고르고, 한 번 실패로 울리지 않게 연속 실패 뒤 알리도록 둔다 → 저장. `/healthz`는 DB에 쿼리가 닿으면 200, 아니면 503이고, 터널이 끊기면 530, 서버가 꺼져 있으면 502다. 내려감·복구 때 한 번씩만 알린다. `/healthz`는 WAF에서 열어 두었다.

## 로그

| 위치 | 내용 |
|---|---|
| `LOG_DIR/mcp/growth-assistant.<날짜>.<번호>.log` | MCP 서버 로그 (Claude Desktop 설정에서 `LOG_DIR`를 줬을 때). 하루 또는 10MB마다 새 파일, 최근 30개 보관. `current.log`가 지금 쓰는 파일을 가리킨다 |
| Claude Desktop의 MCP 로그 (`~/Library/Logs/Claude/mcp-server-growth-assistant.log`) | `LOG_DIR`가 없을 때의 로그와 시작 실패(환경 변수 오류, node를 찾지 못함) |
| `~/.growth-assistant/logs/mcp-http/growth-assistant.<날짜>.<번호>.log` | 상시 실행 MCP HTTP 서버 로그. 회전·보관은 위와 같고 `current.log`가 지금 파일이다 |
| `~/.growth-assistant/logs/launchd/server.{out,err}.log` | 상시 실행 서버의 표준출력·표준에러. 로거가 뜨기 전 오류(node·릴리스를 찾지 못함)와 시작 실패만 남는다. 회전하지 않는다 |
| `llm_call_log` 테이블 | Claude CLI 호출마다 용도·모델·소요 시간·성공 여부·오류 |

## 문제 해결

- **"Claude CLI 인증 오류" 알림(로그 `[관리 알림] CLAUDE_CLI_AUTH`):** Mac mini에서 `claude`를 실행해 다시 로그인한다. 다음 호출부터 정상으로 돌아온다.
- **"허용되지 않은 계정이 로그인을 시도했다" 알림:** 로그의 `[관리 알림] LOGIN_REJECTED` 줄에서 이메일을 본다. 내 다른 계정이면 무시하거나 `OAUTH_ALLOWED_EMAILS`에 더하고, 모르는 계정이 되풀이되면 누군가 이 서버를 커넥터로 붙여 보는 중이다(허용 목록과 동의 화면이 막는다).
- **"리프레시 토큰 재사용으로 연결을 폐기했다" 알림:** 토큰 탈취이거나 클라이언트가 같은 토큰을 두 번 보낸 것이다. Claude에서 커넥터를 다시 연결한다. 되풀이되면 모든 연결을 폐기한다(위 "로그인을 끊고 싶을 때").
- **Desktop에 서버가 failed로 보이거나 도구가 없음:** Desktop의 MCP 로그를 본다. `ops/desktop-config.sh`를 다시 실행해 설정의 경로가 맞는지 비교한다. 설정 파일이 JSON 형식에 맞지 않으면 Desktop이 서버를 하나도 띄우지 않는다.
- **`.env`를 읽지 못함(`EPERM`):** 레포가 `~/Documents`, `~/Desktop`, `~/Downloads` 아래에 있으면 macOS 개인정보 보호가 Desktop이 띄운 프로세스의 접근을 막을 수 있다. 레포를 그 밖(예: `~/dev`)으로 옮기거나 시스템 설정 → 개인정보 보호 및 보안에서 Claude에 접근을 허용한다.
- **도구가 오류를 돌려줌:** 오류 문장의 "원인"을 본다. `ECONNREFUSED`면 DB가 안 떠 있으니 `docker compose up -d`. `relation ... does not exist`처럼 테이블이 없으면 마이그레이션이 덜 된 것이니 `ops/deploy.sh`나 `npm run db:migrate`.
- **`claude`를 찾지 못함 (`UNKNOWN: Error: spawn claude ENOENT`):** `which claude`로 경로를 찾아 `.env`에 `CLAUDE_EXECUTABLE=<경로>`를 넣는다. 상시 실행 서버는 `.env`를 시작할 때 읽으므로 넣은 뒤 `launchctl kickstart -k gui/$(id -u)/com.growthassistant.server`로 다시 띄운다.

## Mac 설정

### 잠자기와 전원

Claude Desktop과 (4단계부터) 원격 서버, (5단계부터) 예약 작업이 멈추지 않도록 잠자기를 끈다. 모니터는 꺼져도 된다.

```bash
sudo pmset -a sleep 0 displaysleep 10 autorestart 1 womp 1
pmset -g   # 확인
```

- `sleep 0`: 시스템 잠자기 끔
- `autorestart 1`: 정전 뒤 전원이 돌아오면 자동으로 켬
- `womp 1`: 네트워크로 깨우기
- 본체 전원 버튼을 짧게 누르면 잠자기에 들어간다(`Sleep On Power Button 1`). 모니터 전원만 끈다.

### FileVault와 재부팅

FileVault를 켜 두었다(2026-10-13 결정, ADR-0035에서 유지). 디스크 암호화라서 재부팅 뒤에는 **사용자가 로그인해야** Docker(DB), `claude`, Claude Desktop, 상시 실행 서버가 동작한다. 화면 잠금으로는 멈추지 않는다.

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
