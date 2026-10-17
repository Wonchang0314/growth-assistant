# growth-assistant

내 프로젝트·문제 해결 경험(Notion)을 기억하고, 약점 보완과 다음 학습을 이끄는 개인 AI 어시스턴트. 첫 모듈은 튜터(퀴즈·간격 반복·튜터링 대화·먼저 말 걸기)이고, Claude 앱에 붙이는 MCP 서버로 쓴다. LLM은 Claude 구독(Claude 앱, `claude -p` CLI)으로만 쓰고 API 키는 쓰지 않는다.

## 기술 스택

- TypeScript 6 (strict, ESM), Node.js 24, NestJS 12 (HTTP 없이 애플리케이션 컨텍스트), npm
- PostgreSQL 16 (Docker), Drizzle ORM, drizzle-kit 마이그레이션
- MCP: 공식 TypeScript SDK v2 (`@modelcontextprotocol/server`, 테스트용 `@modelcontextprotocol/client`)
- LLM: `claude` CLI 서브프로세스
- 설정·검증: `@nestjs/config` + zod, 시드 개념 YAML 파싱은 `yaml`
- 테스트: Vitest, Testcontainers
- 코드 스타일: ESLint(typescript-eslint) + Prettier (`npm run check`에 포함)

**인터페이스 (ADR-0018):** Claude 앱 + MCP 서버. 먼저 맥미니(이 Mac)의 Claude Desktop에 로컬(stdio)로 붙여 기능과 퀴즈 품질을 검증하고, 원격 커스텀 커넥터(모바일·아이패드)는 5단계에서 새 ADR로 정한다. 튜터링 대화는 Claude 앱이 하고 서버는 도구를 제공한다. 이전 Discord 봇 구현은 1단계에서 지웠다(지우기 전 커밋 `fb866c4`). 이전 Kotlin 구현은 커밋 `a7bc8c5`에 있다(`git show a7bc8c5:<경로>`).

## 모듈 구조

```
src/
├── core                 # 여러 기능 모듈이 공유하는 기반
│   ├── clock            # 현재 시각 포트 (테스트에서 고정)
│   ├── config           # 환경 변수 검증 (zod)
│   ├── db               # PostgreSQL 연결, 마이그레이션 (migrations/)
│   ├── logging          # 회전 파일 로거 (LOG_DIR), 표준에러 로거, 운영 알림 포트 (AdminNotifier, 지금은 로그)
│   ├── mcp              # MCP 서버, @McpTool() 처리기 탐색·등록
│   ├── llm              # ClaudeClient, ClaudeCliClient, 프롬프트, 호출 로그
│   ├── memory           # 원문 문서·청크, 경험 카드(STAR+L), 판단 사례(회사 맥락을 걷어낸 버전, ADR-0021)
│   ├── knowledge        # 트랙 6개(ADR-0022), 개념 그래프, 시드 개념(seed/<트랙>.yaml)
│   ├── ingestion        # Notion 수집, 증분 동기화
│   ├── scheduler        # 예약 작업, 놓친 실행 복구
│   └── setting          # 실행 중 정해지는 키-값 설정 (app_setting)
└── tutor                # 튜터 기능 모듈
    ├── study            # 학습 맥락 조회·학습 기록 MCP 도구, 서버 instructions
    ├── quiz             # 출제·검증·채점 (레이어 폴더 시도, ADR-0020)
    ├── mastery          # FSRS, 숙련도·약점
    └── outreach         # 아침 복습, 저녁 주제, 주간 리포트
```

기능 폴더마다 Nest 모듈 하나를 두고, 그 안에 도메인 규칙(순수 함수), 테이블 정의(`*.schema.ts`), Drizzle 저장소, 유스케이스(서비스)를 둔다. MCP 도구 처리기는 그 기능의 `mcp/` 폴더에 둔다. 예외로 `quiz` 모듈은 `domain/`·`application/`·`infrastructure/`·`presentation/` 레이어 폴더로 나눈다(ADR-0020). 진입점은 `mcp-stdio.ts`(Claude Desktop이 띄움, 루트 `McpAppModule`) 하나이고, 상시 실행 진입점은 서버 예약 작업이 생기는 4단계에서 만든다. 유스케이스는 MCP SDK·`child_process` 같은 외부 기술 타입을 모르고 `ClaudeClient` 같은 포트에만 의존한다 (ADR-0015). 테스트는 대상 옆에 `*.spec.ts`로 두고, DB가 필요한 테스트는 `*.db.spec.ts`(Testcontainers 컨테이너 하나를 함께 쓰고 차례로 실행)로 둔다. 여러 모듈에 걸친 테스트와 고정 데이터는 `test/`에 둔다. 상대 경로 import에는 `.js` 확장자를 붙인다(ESM).

## 명령

- 처음 한 번: `cp .env.example .env` 후 값 채우기
- DB 실행: `docker compose up -d`
- 의존성 설치: `npm ci`
- 전체 검사: `npm run check` (타입 검사, 린트, 형식, 테스트. 테스트 DB는 Testcontainers가 띄우므로 Docker만 실행 중이면 된다)
- 테스트만: `npm test` (단위만 `npx vitest --project unit`, Docker 불필요), 감시 모드 `npm run test:watch`
- 실제 `claude` CLI 확인(구독 사용량 소모, 기본 건너뜀): `CLAUDE_LIVE=1 npx vitest run claude-cli.live`
- 마이그레이션 생성: `*.schema.ts`를 고친 뒤 `npm run db:generate -- --name <이름>`. 적용: `npm run db:migrate`(빌드 후 적용). MCP 서버는 시작할 때 적용하지 않는다(배포 스크립트가 적용한다). DB 둘러보기: `npm run db:studio`
- 시드 개념 적재: `npm run db:seed` (`src/core/knowledge/seed/*.yaml`을 검증한 뒤 반영, 여러 번 돌려도 같고 YAML에서 빠진 시드 개념·트랙은 지운다. 배포 스크립트도 마이그레이션 뒤에 돌린다)
- 스타일 자동 수정: `npm run format`, `npx eslint --fix .`
- MCP 서버: `npm run build && npm run mcp` (stdio. 표준출력은 MCP 메시지 통로라 로그는 표준에러나 `LOG_DIR/mcp`에 쓴다. `.env` 위치는 `GROWTH_ENV_FILE`)
- 운영(Mac mini): 배포 `ops/deploy.sh` (검사·빌드·릴리스·마이그레이션·시드 적재, `docs/ops.md`). Claude Desktop은 배포된 릴리스의 MCP 서버를 띄운다. Desktop 설정 항목 출력 `ops/desktop-config.sh`

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
