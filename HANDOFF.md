# 핸드오프: NestJS 전환 이후, 로컬 MCP 1단계 시작 전

- 작성: 2026-10-14 (Windows PC·WSL), 갱신: 2026-10-15 (맥미니)
- 이 파일은 기기를 옮기려고 임시로 커밋했다. 코드 이해도 점검 질문을 마치면 지운다.
- **방향 전환 (ADR-0018):** Discord → PWA(ADR-0017) → Claude 앱 + MCP 서버로 바꿨다. 먼저 맥미니 Claude Desktop에 로컬로 붙여 검증한다. 실제 Discord 점검과 PWA 구현은 하지 않았다. 다음 작업은 `docs/roadmap.md` 1단계를 따른다.

## ADR-0019 (2026-10-15 작성, 브랜치 `docs/adr-0019-core-learning-first`)

- Cowork 예약 작업은 로컬 MCP를 못 쓰고, 클라우드 루틴은 로컬 MCP에 닿지 않는다 → 먼저 말 걸기는 4단계로 미루고 실행 방식은 핵심 기능 검증 뒤 정한다. 알림·인증·보안은 5단계.
- 퀴즈는 객관식·빈칸만 먼저 만든다(코드가 즉시 채점). 서술형(판단·트레이드오프, 면접형 서술)은 설계 문서 12장으로 미뤘다.
- 설계 문서에 약점 반영 출제(오답 보기마다 오개념, 지난 오개념·헷갈린 점을 출제 프롬프트에)와 변형 문제(`key_point`, `variant_of`)를 넣었다.
- 다음: 1단계 첫 작업. stdio MCP 진입점(`mcp-stdio.ts`), `core/mcp`, 첫 도구(`get_learning_context`, `record_study_note`)

## 맥미니 상태 (2026-10-15 확인)

- 전원 설정: `sleep 0`(시스템 잠자기 안 함), `displaysleep 10`, `autorestart 1`. 모니터 전원만 끄면 맥미니는 계속 켜져 있다. 본체 전원 버튼을 짧게 누르면 잠자기에 들어가므로(`Sleep On Power Button 1`) 누르지 않는다.
- 이 세션은 Remote Control을 켜 두어 휴대폰 Claude 앱에서도 이어갈 수 있다.

## 먼저 읽을 것

1. `CLAUDE.md`: 스택(TypeScript·NestJS), 모듈 구조, 명령, 문서 갱신 규칙
2. `docs/roadmap.md`: 진행 상태 (1단계: 로컬 MCP)
3. `docs/adr/0014-nestjs-typescript.md`, `0015-nest-feature-modules.md`, `0016-fsrs-ts-fsrs.md`: 전환 결정, `0018-claude-mcp-server.md`: 인터페이스 (로컬 우선)
4. `docs/specs/2026-10-12-growth-assistant-design.md`: MCP 기준 설계 (7.6 로컬 MCP 구성)
5. `docs/ops.md`: Mac mini 설치·배포·로그

## 작업 방식 (사용자 합의)

- 응답은 한국어로 한다.
- 커밋·푸시는 사용자가 요청할 때만 한다. 커밋 메시지에 AI 서명(attribution) 줄을 넣지 않는다.
- 코드 파일은 Edit·Write로만 수정한다 (Bash로 고치면 문서 검토 훅이 기록하지 못한다).
- 설계와 다른 선택을 해야 하면 구현 전에 사용자와 합의하고, 새 ADR을 쓴다.
- 지우거나 되돌릴 수 없는 작업(Docker 볼륨 삭제, 실제 Discord 서버에 명령 등록 등)은 먼저 허락을 받는다.

## 지금까지 된 것 (브랜치 `migrate/nestjs`)

Kotlin + Spring Boot 구현을 NestJS + TypeScript로 다시 작성했다. Kotlin 원본은 커밋 `a7bc8c5`에 있다(`git show a7bc8c5:<경로>`).

| 단계 | 커밋 | 내용 |
|---|---|---|
| P0 | `fdd2f3f` | ADR-0014(스택), 0015(모듈 구조), 0016(ts-fsrs). 0001·0003·0008·0013은 `대체됨` |
| P1 | `f4cf117` | 골격: Nest 12(ESM), TS 6.0, Vitest 5, ESLint·Prettier, zod 환경 변수 검증 |
| P2 | `7a91d0d` | Drizzle 스키마·baseline 마이그레이션(Flyway V1+V2), 저장소, Testcontainers 테스트 |
| P3 | `dec7ccf` | `core/llm`: CLI 클라이언트, stream 파서, 프로세스 실행기, zod 구조화 출력, `Clock` |
| P4 | `b21e59e` | `core/discord`: 게이트웨이, 처리기 데코레이터 탐색, 채널 자동 준비, 응답 분할, `#관리` 알림 |
| P5 | `5d14a53` | `tutor/conversation`: 대화 서비스, `#튜터` 처리기, `/end`, 유휴 종료 작업, `KeyedLock` |
| P6 | `02cf6e9` | 운영: launchd가 node 실행, 릴리스 디렉터리 배포, 회전 파일 로그, `docs/ops.md` |

**확인한 것:** `npm run check` 통과(테스트 79개, 실제 CLI 테스트 1개는 기본 건너뜀). 실제 `claude` CLI 테스트(`CLAUDE_LIVE=1`)는 WSL에서 한 번 통과. `deploy.sh`로 만든 릴리스를 임시 DB로 실행해 마이그레이션·파일 로그·시작 실패 기록을 확인했다.

**Mac에서 확인한 것 (2026-10-14):** `npm ci`, `npm run check`(테스트 79개), 실제 CLI 테스트(`CLAUDE_LIVE=1`) 통과. Kotlin 시절 DB 볼륨과 Gradle 빌드 결과물을 지웠다. `.claude/hooks/*.mjs` 린트 실패를 고쳤다.

**확인하지 못한 것:** 실제 Discord 서버 연결(하지 않기로 함), launchd 등록·재시작. 운영 등록(`ops/install.sh`)은 서버 예약 작업이 생길 때까지 미룬다. 지금 등록하면 Discord 봇이 상시 실행된다.

## 코드 이해도 점검 질문

사용자는 Kotlin 코드를 따라가기 어려워 TypeScript로 옮겼고, 이 코드베이스로 백엔드 개념을 익히는 것이 목표다. Mac 세션을 시작하면 아래 질문을 **한 번에 하나씩** 묻는다.

- 사용자가 먼저 자기 말로 답하게 한다. 답을 듣기 전에 설명하지 않는다.
- 답을 들은 뒤 "확인할 점"과 비교해 맞은 부분, 빠진 부분을 짚고, 해당 파일의 코드를 같이 본다.
- 모르면 힌트를 한 단계씩 준다. 정답을 바로 주지 않는다.
- 사용자가 원하면 순서를 바꾸거나 건너뛴다. 끝나면 약했던 주제를 짧게 정리한다.

**1. Node는 단일 스레드인데 `ConversationService`는 왜 스레드별 잠금(`KeyedLock`)이 필요한가?**
- 파일: `src/core/concurrency/keyed-lock.ts`, `src/tutor/conversation/conversation.service.ts`
- 확인할 점: `await`마다 다른 작업이 끼어든다. 같은 스레드에 메시지가 연달아 오면 둘 다 "세션 없음"을 보고 세션을 두 번 만들 수 있다(유니크 제약 위반). 유휴 종료 작업과 새 메시지가 겹치면 닫힌 세션에 답할 수 있다. 잠금은 Promise 체인으로 구현했고, 대기 작업이 없으면 키를 지운다. `closeIdle`이 잠금 안에서 세션을 다시 읽는 이유.

**2. Discord ID를 왜 `number`가 아니라 문자열로 다루고, DB에는 어떻게 저장하는가?**
- 파일: `src/core/db/columns.ts`, `src/core/config/env.ts`, `conversation.repository.db.spec.ts`
- 확인할 점: snowflake는 2^53을 넘어 JS `number`로는 끝자리가 바뀐다. discord.js도 문자열을 쓴다. DB는 `bigint`, 코드는 문자열인 `snowflake` 커스텀 컬럼(pg 드라이버가 int8을 문자열로 준다). PostgreSQL `bigint` 최댓값(약 9.22×10^18)을 넘는 값은 쿼리 자체가 실패한다(테스트를 쓰다 실제로 겪었다).

**3. 세션 타입을 `ActiveSession | ClosedSession` 유니온으로 둔 이유는? Kotlin의 `check(status == ACTIVE)`와 무엇이 다른가?**
- 파일: `src/tutor/conversation/session.ts`, `conversation.repository.ts`의 `toSession`
- 확인할 점: `closeSession`은 `ActiveSession`만 받으므로 닫힌 세션을 닫는 코드는 컴파일되지 않는다(실행 중 검사 → 컴파일 시점 검사). `status`로 좁히기(narrowing). 상태 변경 함수는 새 객체를 돌려준다(불변). DB 행이라는 외부 데이터를 도메인 타입으로 바꾸는 경계(`toSession`)에서만 실행 중 검사를 한다.

**4. `completeStructured`는 zod 스키마 하나를 어디에 두 번 쓰는가? 그리고 어떤 실패는 다시 시도하고 어떤 실패는 하지 않는가?**
- 파일: `src/core/llm/claude-cli.client.ts`, `claude-stream.parser.ts`, `src/tutor/conversation/conversation-prompts.ts`
- 확인할 점: `z.toJSONSchema`로 `--json-schema`에 넘기고, 같은 스키마의 `safeParse`로 응답을 검증한다(스키마가 한 곳). 타임아웃은 한 번 재시도, 형식 오류(`INVALID_OUTPUT`)는 오류 내용을 프롬프트에 붙여 한 번 재요청, 인증 오류는 재시도 없이 `#관리`에 한 번만 알리고 성공하면 알림 상태를 푼다. 호출 기록 저장 실패는 결과를 바꾸지 않는다. 성공 여부는 `subtype`이 아니라 `is_error`로 판단한다(ADR-0012).

**5. `ClaudeCliClient` 생성자에는 `@Inject`가 없는데 Nest는 무엇을 넣어야 할지 어떻게 아는가? `DB`에는 왜 `@Inject(DB)`가 필요한가?**
- 파일: `tsconfig.json`(`emitDecoratorMetadata`), `src/core/llm/llm.module.ts`, `src/core/db/db.module.ts`, `test/nest-di.spec.ts`
- 확인할 점: TS가 생성자 매개변수 타입을 `design:paramtypes` 메타데이터로 남기고 Nest가 읽는다. 그래서 주입 토큰은 실행 중에 존재하는 값이어야 한다. 추상 클래스(`ClaudeClient`, `Clock`)는 값이라 토큰이 되고, 인터페이스·타입 별칭은 사라지므로 `Symbol` 토큰 + `@Inject`가 필요하다(`DB`, `DISCORD_SETTINGS`). 주입받는 클래스를 `import type`으로 가져오면 메타데이터가 `Object`가 되어 깨진다. Vitest 5는 Vite 8의 Oxc가 tsconfig를 읽어 메타데이터를 만들므로 `unplugin-swc`가 필요 없다(변환 캐시 주의).

**6. `core`는 `tutor`를 모르는데, Discord 게이트웨이는 `/end` 처리기를 어떻게 찾아 등록하는가?**
- 파일: `src/core/discord/discord-handlers.ts`, `discord-gateway.ts`, `eslint.config.js`
- 확인할 점: `DiscoveryService.createDecorator()`로 만든 `@SlashCommand()`·`@GuildMessage()`를 기능 모듈의 provider에 붙이고, 게이트웨이가 `getProviders({ metadataKey })`로 모은다(의존성 역전). 명령 이름 중복은 `onModuleInit`에서 막아 Discord를 꺼도 테스트에서 잡힌다. `core` → `tutor` import는 ESLint `no-restricted-imports`가 막는다(ADR-0015). 이벤트 진입점에서 예외를 모두 잡는 이유(처리하지 않은 Promise 거부는 프로세스를 끝낸다).

**7. 프로세스 실행기는 왜 `detached: true`로 띄우고 `process.kill(-pid)`로 끝내는가? 출력은 왜 끝까지 계속 읽는가?**
- 파일: `src/core/llm/claude-process.runner.ts`, `claude-process.runner.spec.ts`
- 확인할 점: 새 프로세스 그룹을 만들어 타임아웃 때 CLI가 띄운 자식 프로세스까지 한 번에 끝낸다(음수 pid = 그룹). 출력을 읽지 않으면 파이프 버퍼가 차서 자식이 멈춘다. 자식이 입력을 다 읽기 전에 끝나면 stdin에 EPIPE가 난다. 실행 파일이 없으면 `error` 이벤트(ENOENT). WSL에서는 이름만 준 없는 명령이 PATH의 Windows 경로(9P)를 뒤지다 이벤트 루프를 막은 일이 있어 테스트를 절대 경로로 바꿨다.

**8. 마이그레이션은 어디서 만들어지고 언제 적용되는가? DB 테스트는 컨테이너를 어떻게 공유하고 서로 간섭하지 않는가?**
- 파일: `drizzle.config.ts`, `src/core/db/db.module.ts`, `src/core/db/migrations/`, `test/db/global-setup.ts`, `test/db/test-db.ts`, `vitest.config.ts`
- 확인할 점: 각 모듈의 `*.schema.ts`를 drizzle-kit이 비교해 SQL을 만든다(`npm run db:generate`). 앱이 시작할 때 `migrate()`가 아직 안 한 것만 적용하고, 실패하면 시작하지 않는다. 마이그레이션 폴더는 빌드 때 `dist`로 복사되어 릴리스만으로 동작한다. 테스트는 Vitest 프로젝트를 `unit`/`db`로 나누고, `db`는 전역 설정에서 컨테이너 하나를 띄워 마이그레이션한 뒤 `provide`/`inject`로 접속 정보를 넘긴다. 파일을 차례로 실행하고 테스트마다 `TRUNCATE`. 컨테이너는 tmpfs·fsync 끔으로 빠르게(31초 → 8.6초).

**9. 배포는 왜 jar처럼 덮어쓰지 않고 릴리스 디렉터리 + `current` 링크로 하는가? 로그 회전과 시작 실패는 어떻게 처리하는가?**
- 파일: `ops/deploy.sh`, `ops/install.sh`, `ops/com.growthassistant.bot.plist`, `src/main.ts`, `src/core/logging/file-logger.ts`, `src/tutor/conversation/discord/idle-session.job.ts`
- 확인할 점: 실행 중인 파일을 덮어쓰지 않고, 링크만 바꿔 되돌리기가 쉽다(최근 3개 보관, 운영 의존성만 설치). launchd는 붙잡고 있는 파일을 회전하지 못하므로 앱이 회전한다: Nest `ConsoleLogger`의 JSON 모드는 모든 기록을 `printAsJson` 하나로 보내므로 그것만 바꿔 `pino-roll` 파일에 쓴다. `abortOnError: false`로 시작 실패를 예외로 받아 원인(`cause`)까지 기록하고 파일을 닫은 뒤 종료 → launchd가 30초 뒤 재시작. `@Interval`은 이전 실행을 기다리지 않아(Spring `fixedDelay`와 다름) 유휴 작업에 실행 중 플래그를 뒀다.

**10. 기술 선택: 왜 TypeScript 7이 아니라 6인가? 왜 Prisma가 아니라 Drizzle인가? FSRS는 왜 직접 구현하지 않는가?**
- 파일: `docs/adr/0014-nestjs-typescript.md`, `docs/adr/0016-fsrs-ts-fsrs.md`
- 확인할 점: TS 7(Go 네이티브)은 기존 JS 컴파일러 API가 없어 typescript-eslint와 Nest CLI가 동작하지 않는다. 이 규모에서는 속도 이득이 작고, 6.0은 7로 가는 다리 버전이라 나중에 올리기 쉽다(대안: oxlint). Drizzle은 SQL이 그대로 보여 학습 목표에 맞고, 재귀 CTE 같은 복잡한 쿼리에서 원시 SQL로 빠지는 일이 적으며, 생성된 마이그레이션 SQL을 직접 읽고 고칠 수 있다(대가: 엔티티 메서드가 없어 도메인 함수 분리). FSRS는 Kotlin에서는 GPL 라이브러리뿐이라 포팅하려 했지만, TS에는 공식 MIT 구현 `ts-fsrs`가 있다(버전 고정, 대표 시나리오 테스트).
