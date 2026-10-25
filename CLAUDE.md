# growth-assistant

내 프로젝트·문제 해결 경험(Notion)을 기억하고, 약점 보완과 다음 학습을 이끄는 개인 AI 어시스턴트. 첫 모듈은 튜터(퀴즈·간격 반복·튜터링 대화·먼저 말 걸기)이고, Claude 앱에 붙이는 MCP 서버로 쓴다. LLM은 Claude 구독(Claude 앱, `claude -p` CLI)으로만 쓰고 API 키는 쓰지 않는다.

## 기술 스택

- TypeScript 6 (strict, ESM), Node.js 24, NestJS 12 (MCP HTTP 진입점만 Nest HTTP 앱(`@nestjs/platform-express`, Express 5), stdio 진입점과 CLI는 HTTP 없이 애플리케이션 컨텍스트), npm
- PostgreSQL 16 (Docker), Drizzle ORM, drizzle-kit 마이그레이션
- MCP: 공식 TypeScript SDK v2 (`@modelcontextprotocol/server`, HTTP 진입점의 Express 미들웨어 `@modelcontextprotocol/express`(Host·Origin 검사)와 Node 요청 변환 `@modelcontextprotocol/node`(`toNodeHandler`), 테스트용 `@modelcontextprotocol/client`, MCP Apps 화면 도구 등록 `@modelcontextprotocol/ext-apps/server`. 화면 HTML은 의존성 없는 한 파일로 기능 폴더의 `views/`에 두고 빌드 때 복사한다)
- LLM: `claude` CLI 서브프로세스
- 간격 반복: `ts-fsrs` (버전 고정, ADR-0016·0028)
- 예약 작업: `@nestjs/schedule`과 그 크론 라이브러리 `cron`(둘 다 버전 고정, `SchedulerRegistry`에 동적으로 등록, ADR-0036)
- 설정·검증: `@nestjs/config` + zod, 시드 개념 YAML 파싱은 `yaml`
- 인증: OAuth 2.1 인가 서버를 직접 구현(`core/auth`), 구글 id_token 검증은 `jose`, Bearer 401 응답·메타데이터 모양은 MCP SDK 도우미
- 테스트: Vitest, Testcontainers
- 코드 스타일: ESLint(typescript-eslint) + Prettier (`npm run check`에 포함)

**인터페이스 (ADR-0018):** Claude 앱 + MCP 서버. 먼저 맥미니(이 Mac)의 Claude Desktop에 로컬(stdio)로 붙여 기능을 검증했고, 지금은 Claude 앱(웹·Desktop·모바일)이 원격 커스텀 커넥터 `https://mcp.seok.app/mcp`(Cloudflare 터널, OAuth 2.1 CIMD·구글 로그인, ADR-0035)로 붙는다(2026-10-20). 로컬 stdio 등록은 Desktop 설정에서 뺐고, 원격이 안 될 때 대신 쓰는 용도로 남긴다. 퀴즈 품질은 원격 전환과 예약 작업으로 프로토타입을 만든 뒤 실제로 쓰며 올린다(ADR-0034). 튜터링 대화는 Claude 앱이 하고 서버는 도구를 제공한다. 이전 Discord 봇 구현은 1단계에서 지웠다(지우기 전 커밋 `fb866c4`). 이전 Kotlin 구현은 커밋 `a7bc8c5`에 있다(`git show a7bc8c5:<경로>`).

## 모듈 구조

```
src/
├── core                 # 여러 기능 모듈이 공유하는 기반
│   ├── auth             # OAuth 2.1 인가 서버(메타데이터, /authorize, 구글 로그인·동의 화면, /token)와 /mcp Bearer 검사 (HTTP 진입점, ADR-0035)
│   ├── clock            # 현재 시각 포트 (테스트에서 고정)
│   ├── config           # 환경 변수 검증 (zod)
│   ├── db               # PostgreSQL 연결, 마이그레이션 (migrations/)
│   ├── health           # GET /healthz (HTTP 진입점, DB 쿼리 확인)
│   ├── logging          # 회전 파일 로거 (LOG_DIR), 표준에러 로거, 운영 알림 포트 (AdminNotifier, ntfy·같은 종류 1시간 묶기, NTFY_TOPIC 없으면 로그), ntfy 전송
│   ├── mcp              # MCP 서버, @McpTool() 처리기 탐색·등록, /mcp 컨트롤러(Streamable HTTP)
│   ├── llm              # ClaudeClient, ClaudeCliClient, 프롬프트, 호출 로그
│   ├── memory           # 원문 문서·청크, 경험 카드(STAR+L), 판단 사례(회사 맥락을 걷어낸 버전, ADR-0021)
│   ├── knowledge        # 트랙 6개(ADR-0022), 개념 그래프, 시드 개념(seed/<트랙>.yaml)
│   ├── ingestion        # Notion 수집, 증분 동기화, 경험 카드 추출, 수집 파이프라인(동기화→추출), 수집 상태·바로 동기화·개념 검토 MCP 도구
│   ├── scheduler        # 매일 예약 작업(@ScheduledJob()), 실행 기록(scheduled_job), 놓친 실행 따라잡기, DB advisory 잠금. 스케줄러는 HTTP 진입점에서만 켠다
│   └── setting          # 실행 중 정해지는 키-값 설정 (app_setting)
└── tutor                # 튜터 기능 모듈
    ├── study            # 학습 맥락 조회·경험 카드 검색·학습 기록 MCP 도구, 서버 instructions
    ├── quiz             # 출제·검증, 복습 문제 고르기·채점·신고·약점 보고·출제 지침 MCP 도구, MCP Apps 복습 카드(오늘 문제 슬라이드, 문제마다 제출) (레이어 폴더와 출력 포트, ADR-0020·0029·0030·0031)
    ├── mastery          # 개념별 FSRS 복습 일정(ts-fsrs 어댑터), 숙련도·약점
    └── outreach         # 서버가 먼저 하는 일: 새벽 준비(04:00), 학습 알림(07:30 아침·21:00 저녁, ntfy). 저녁 주제·주간 리포트는 6단계
```

기능 폴더마다 Nest 모듈 하나를 두고, 그 안에 도메인 규칙(순수 함수), 테이블 정의(`*.schema.ts`), Drizzle 저장소, 유스케이스(서비스)를 둔다. MCP 도구 처리기는 그 기능의 `mcp/` 폴더에 둔다. 예외로 `quiz` 모듈은 `domain/`·`application/`·`infrastructure/`·`presentation/` 레이어 폴더로 나누고, application이 저장소·출제 어댑터를 포트로 둬 infrastructure가 구현한다(ADR-0020·0029, 방향은 `eslint.config.js`의 `quizLayer`가 검사). 여러 레이어를 함께 쓰는 테스트는 모듈 루트에 둔다. MCP 진입점은 `mcp-stdio.ts`(Claude Desktop이 띄움, 루트 `McpAppModule`을 애플리케이션 컨텍스트로)와 `mcp-http.ts`(Nest HTTP 앱, 원격 커넥터의 바탕)이고, 로거와 시작 실패 처리는 `mcp-entry.ts`가 함께 맡는다. HTTP 앱의 루트 `McpHttpAppModule`은 `McpAppModule`에 `/mcp`(`McpHttpController`)와 `/healthz`(`HealthModule`)를 얹는다. HTTP 경로를 더할 때는 그 기능 모듈에 컨트롤러를 두고 모듈을 이 루트 모듈에 import한다. 상시 실행 서버(`mcp-http.ts`)의 루트 `McpHttpServerModule`은 여기에 스케줄러(`SchedulerHostModule`)와 예약 작업(`OutreachModule`)을 더한다(ADR-0036). 테스트는 `McpHttpAppModule`을 띄워 예약 작업이 돌지 않는다. 예약 작업은 `DailyJob`을 구현하고 `@ScheduledJob()`을 붙인 provider로 둔다. 유스케이스는 MCP SDK·`child_process` 같은 외부 기술 타입을 모르고 `ClaudeClient` 같은 포트에만 의존한다 (ADR-0015). 테스트는 대상 옆에 `*.spec.ts`로 두고, DB가 필요한 테스트는 `*.db.spec.ts`(Testcontainers 컨테이너 하나를 함께 쓰고 차례로 실행)로 둔다. 여러 모듈에 걸친 테스트와 고정 데이터는 `test/`에 둔다. 상대 경로 import에는 `.js` 확장자를 붙인다(ESM).

## 명령

- 처음 한 번: `nvm install`(Node 버전은 `.nvmrc`, `engine-strict`라 범위 밖 버전이면 `npm ci`가 실패한다), `cp .env.example .env` 후 값 채우기
- DB 실행: `docker compose up -d`
- 의존성 설치: `npm ci`
- 전체 검사: `npm run check` (타입 검사, 린트, 형식, 테스트. 테스트 DB는 Testcontainers가 띄우므로 Docker만 실행 중이면 된다)
- 테스트만: `npm test` (단위만 `npx vitest --project unit`, Docker 불필요), 감시 모드 `npm run test:watch`
- 실제 `claude` CLI 확인(구독 사용량 소모, 기본 건너뜀): `CLAUDE_LIVE=1 npx vitest run claude-cli.live`
- 마이그레이션 생성: `*.schema.ts`를 고친 뒤 `npm run db:generate -- --name <이름>`. 적용: `npm run db:migrate`(빌드 후 적용). MCP 서버는 시작할 때 적용하지 않는다(배포 스크립트가 적용한다). DB 둘러보기: `npm run db:studio`
- Notion 동기화: `npm run sync` (`.env`의 `NOTION_TOKEN`, `NOTION_ROOT_IDS`. 처음이 백필이고 그 뒤로는 바뀐 문서만 읽는다). 운영에서는 상시 실행 서버의 04:00 새벽 작업과 `sync_now` 도구가 동기화·추출을 한다
- 경험 카드 추출(구독 사용량 소모): `npm run extract` (아직 뽑지 않았거나 실패한 문서 전체), `-- --limit 5`(앞에서 5개), `-- --ids 3,7`(상태와 상관없이 그 문서를 다시)
- 판단 사례 추상화(구독 사용량 소모, 검증은 Opus. 새벽 작업은 돌리지 않고 지금은 문제에 쓰지 않는다, ADR-0038): `npm run abstract` (선별하지 않은 카드를 모두 선별하고 판단이 분명한 카드 전부), `-- --limit 10`(판단이 분명한 카드 10장만), `-- --ids 3,7`(선별 없이 그 경험 카드를 다시)
- 문제 만들어 보기(구독 사용량 소모, 검증은 Haiku가 보기만 보고 풀기, ADR-0041): `npm run quiz -- --concept "인덱스 원리"` (복습에서 내는 유형으로 2문제를 문제 풀에 저장하고 출력. 지금은 객관식만이고 빈칸은 `--type FILL_BLANK`로만, ADR-0033), `-- --type FILL_BLANK --count 3`, `-- --variant-of 12`(그 문제의 변형). 각도는 숙련도로 정해진다(ADR-0038)
- 시드 개념 적재: `npm run db:seed` (`src/core/knowledge/seed/*.yaml`을 검증한 뒤 반영, 여러 번 돌려도 같고 YAML에서 빠진 시드 개념·트랙은 지운다. 배포 스크립트도 마이그레이션 뒤에 돌린다)
- 스타일 자동 수정: `npm run format`, `npx eslint --fix .`
- MCP 서버: `npm run build && npm run mcp` (stdio. 표준출력은 MCP 메시지 통로라 로그는 표준에러나 `LOG_DIR/mcp`에 쓴다. `.env` 위치는 `GROWTH_ENV_FILE`)
- MCP HTTP 서버: `npm run build && npm run mcp:http` (Nest HTTP 앱. Streamable HTTP `http://127.0.0.1:3100/mcp`, 헬스체크 `GET /healthz`(DB에 닿으면 200, 아니면 503). 주소는 `MCP_HTTP_HOST`·`MCP_HTTP_PORT`, 로그는 표준에러나 `LOG_DIR/mcp-http`, SIGINT·SIGTERM으로 끝낸다. 예약 작업(04:00 새벽 준비, 07:30·21:00 학습 알림)도 이 프로세스에서만 돌고, 시작할 때 DB를 1분까지 기다린 뒤 오늘 놓친 작업을 한 번 따라잡는다. 수동으로 띄우면 실제 동기화·추출·알림이 돌 수 있다. `/mcp`는 OAuth 액세스 토큰이 있어야 하고, `PUBLIC_BASE_URL`·`GOOGLE_OAUTH_CLIENT_ID`·`GOOGLE_OAUTH_CLIENT_SECRET`·`OAUTH_ALLOWED_EMAILS`가 없으면 시작하지 않는다. 로컬 흐름 시험은 `docs/ops.md` "OAuth")
- 운영(Mac mini): 배포 `ops/deploy.sh` (검사·빌드·릴리스·마이그레이션·시드 적재, `docs/ops.md`). 상시 실행 MCP HTTP 서버 등록 `ops/install.sh`(해제 `ops/uninstall.sh`), 공개 경로는 Cloudflare 터널, 예약 작업 상태·아침 알림 켜기는 `docs/ops.md` "예약 작업". 로컬 stdio를 Desktop에 대신 붙일 때의 설정 항목 출력 `ops/desktop-config.sh`

## 문서

- 진행 상태: `docs/roadmap.md`
- 세션 이어 가기(다음 할 일 순서, 학습 진도, 조사 메모): `docs/handoff.md`
- 운영 가이드: `docs/ops.md`
- 수동 점검 체크리스트 (Claude Desktop에서 확인): `docs/manual-check.md`
- 기능 설계: `docs/specs/`
- 아키텍처(C4): `docs/architecture/`
- 결정 기록(ADR): `docs/adr/`
- 조사 자료(작업 입력, 쓰고 나면 지움): `docs/research/`

## 문서 갱신 규칙

코드를 고치면 Stop 훅(`.claude/hooks/`)이 종료 전에 문서 검토를 한 번 요구한다. 코드 파일은 Edit·Write로만 고친다(Bash로 고치면 훅이 기록하지 못한다).

| 바뀐 것 | 검토할 문서 |
|---|---|
| 패키지 추가·이동, 기술 스택·의존성, 빌드·실행 명령 | `CLAUDE.md`, `docs/architecture/c4-3-component.md` |
| 외부 연동, 실행 환경, 컨테이너 구성 | `docs/architecture/c4-2-container.md`, `c4-1-context.md` |
| 데이터 모델(Drizzle 스키마·마이그레이션), 흐름·정책·스케줄 | `docs/specs/` 설계 문서 |
| ADR 결정과 다른 선택 | 새 ADR 작성 후 기존 ADR 상태를 `대체됨`으로 (채택된 ADR 본문은 고치지 않음) |
| 단계 작업 완료 | `docs/roadmap.md` 체크와 현재 위치 |

문서가 지금 코드와 다른 내용을 말하고 있으면 고친다. 이름 변경이나 내부 리팩터처럼 문서에 드러나지 않는 변경이면 고치지 않는다.
