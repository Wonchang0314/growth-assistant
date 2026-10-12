# 핸드오프: 다음 세션 시작용

- 작성: 2026-10-13 (Mac mini에서 작성, 다음 세션은 Windows PC에서 이어감)
- 이 파일은 Windows PC로 옮기려고 임시로 커밋했다. 1단계 골격 작업을 시작하고 나면 지우고 커밋한다.

## 먼저 읽을 것

1. `CLAUDE.md`: 스택, 패키지 구조, 문서 갱신 규칙
2. `docs/roadmap.md`: 진행 상태 (현재 1단계)
3. `docs/specs/2026-10-12-growth-assistant-design.md`: 기능 설계 전체
4. `docs/adr/README.md`: 결정 목록 (0001~0011)

## 지금까지 된 것

- 설계 확정 및 커밋: 스펙, C4 1~3레벨, ADR 11건, 로드맵
- 프로젝트 훅: Edit·Write로 코드 파일을 고치면, Stop 시점에 문서 검토를 한 번 강제한다 (`.claude/hooks/`, `.claude/settings.json`).
- 플러그인 정리: superpowers(사용자 범위)를 삭제했다. seokit은 설치되어 있지만 이 레포에서는 동작하지 않는다 (`.claude/docs-map.md`가 없음). 두 플러그인 모두 이 프로젝트에서 쓰지 않는다.
- 0단계 준비 완료, 로드맵을 1단계로 옮겼다. 1단계 버전을 확정했다(아래).
- GitHub 비공개 레포 `Wonchang0314/growth-assistant`에 푸시했다.
- 아직 코드는 없다.

## 작업 방식 (사용자 합의)

- 응답은 한국어로 한다.
- 상세 작업 계획은 세션 안에서만 관리하고 파일로 남기지 않는다. 진행 상태는 `docs/roadmap.md`에만 갱신한다. (예외: 기기를 옮길 때는 이 핸드오프 파일로 넘긴다.)
- 커밋은 사용자가 요청할 때만 한다. 커밋 메시지에 AI 서명(attribution) 줄을 넣지 않는다.
- 코드 파일은 Edit·Write로만 수정한다 (Bash로 고치면 훅이 기록하지 못한다).
- 설계와 다른 선택을 해야 하면 구현 전에 사용자와 합의하고, 새 ADR을 쓴다.

## 개발·운영 환경

- **개발·테스트:** Windows PC. **운영(상시 실행):** Mac mini M4.
- **봇은 한 곳에서만 실행한다.** 같은 토큰으로 두 기기에서 동시에 띄우면 메시지에 두 번 응답한다.
- Windows에 필요한 것: JDK 21, Docker Desktop(PostgreSQL, Testcontainers), Git for Windows(프로젝트 훅이 bash 스크립트), `claude` CLI 설치·로그인.
- Gradle은 Mac에 설치되어 있지 않아 wrapper를 만들지 못했다. Windows에서 Gradle 9.8.1로 `gradle wrapper`를 한 번 실행해 `gradlew`를 만들고 커밋한다(Gradle 설치 방법은 사용자에게 확인).
- 골격 작업 때 `.gitattributes`를 넣는다: `*.sh`·`gradlew`는 LF, `*.bat`은 CRLF.
- `claude` 실행 파일 경로는 OS마다 다르므로(`claude`, `claude.exe`, `claude.cmd`) `ClaudeCliClient`는 경로를 설정값으로 받는다. CLI 스파이크는 Windows에서 하되, 운영 전에 Mac mini에서 한 번 더 확인한다.
- launchd, `pmset` 등 운영 작업(8번)은 Mac mini에서 한다.

## 0단계 결과

| 항목 | 상태 | 비고 |
|---|---|---|
| JDK 21 | ✅ | Mac: Temurin 21.0.12.1. Windows는 따로 확인 |
| Discord 개인 서버 | ✅ | 사용자가 생성함. 서버 ID는 사용자가 확인함 |
| Discord 채널 5개 | ✅ 결정 | `#복습-퀴즈` `#튜터` `#리포트` `#개념-관리` `#관리`. **봇이 시작할 때 이름으로 찾고, 없으면 만든 뒤 ID를 `app_setting`에 저장한다.** 스펙 7.6에 반영해야 한다 |
| Discord 봇 | ✅ | 토큰은 사용자가 보관. 권한: View Channels, Send Messages, Send Messages in Threads, Create Public Threads, Manage Threads, Read Message History, Embed Links, Manage Channels / 범위: `bot`, `applications.commands` |
| Message Content Intent | 확인 필요 | 게이트웨이 작업 전에 확인 |
| 사용자 ID | 확인 필요 | 사용자명(`jangweonseog8865`)이 아니라 숫자 ID다. 개발자 모드 → 프로필 우클릭 → 사용자 ID 복사 |
| `claude -p` | ✅ | Mac: CLI 2.1.241. `--json-schema` `--tools` `--system-prompt` `--setting-sources` `--strict-mcp-config` 지원 |
| Docker | ✅ | Mac: 29.4.0 |
| 상시 실행 전원 설정 | ✅ | Mac mini M4. `pmset`: sleep 0, displaysleep 10, autorestart 1, womp 1 |

봇 토큰과 ID는 채팅으로 받지 않는다. 사용자가 `.env`에 직접 넣는다(`.env.example`에 `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_OWNER_USER_ID`).

**`docs/ops.md`에 넣을 운영 메모 (8번 작업):**
- 위 `pmset` 설정. 모니터는 꺼도 된다.
- FileVault가 켜져 있어서 재부팅 뒤 사용자가 로그인해야 앱, Docker, `claude`가 동작한다. 계획된 재시작은 `sudo fdesetup authrestart`로 한다. 사용자는 FileVault를 켜 두기로 했다(2026-10-13). 정전 뒤 자동 복구는 되지 않고, 재부팅 뒤 직접 로그인해야 한다.
- macOS 자동 업데이트 설치를 끌 것을 권장한다. Docker(또는 OrbStack)는 로그인할 때 자동으로 실행되게 한다.
- 원격 관리: SSH와 화면 공유를 켜고, 외부에서 접속하려면 Tailscale을 쓴다. 봇은 Discord에 먼저 접속하는 방식이라 포트포워딩이 필요 없다.

## 확정 버전 (2026-10-13, Maven Central 기준)

| 항목 | 버전 | 비고 |
|---|---|---|
| Gradle | 9.8.1 | |
| Spring Boot | 4.1.1 | 4.2는 마일스톤이라 제외 |
| Kotlin | 2.4.21 | Boot 4.1.1 기본값은 2.3.21. jda-ktx 0.15.0이 Kotlin 2.4.0으로 빌드되어 올림 (`kotlin.version` 덮어쓰기) |
| kotlinx-coroutines | 1.11.0 | Boot 기본값 1.10.2. jda-ktx 요구에 맞춤 (`kotlin-coroutines.version` 덮어쓰기) |
| JDA | 6.7.0 | jda-ktx 0.15.0은 JDA 6.5.0 기준. 빌드로 호환 확인 |
| jda-ktx | 0.15.0 | `club.minnced:jda-ktx` |
| Testcontainers | 2.0.5 | Boot 관리 버전. 2.x는 모듈 이름이 `testcontainers-postgresql` 형태 |
| Flyway | 12.4.0 | Boot 관리 버전. `flyway-database-postgresql` 필요 |
| MockK | 1.14.11 | 스프링 빈 목은 springmockk 5.0.1 |
| ktlint Gradle 플러그인 | 14.2.0 | `org.jlleitschuh.gradle.ktlint` |

Boot 4는 Jackson 3(`tools.jackson`)을 쓴다. Kotlin 모듈도 Jackson 3용을 쓴다.

## 다음 작업: 1단계 MVP (승인된 계획)

**목표:** `/tutor` 명령으로 `#튜터`에 스레드가 열리고, 맥락을 유지하는 튜터링 대화가 동작한다(웹 검색과 출처 포함).

1. ~~0단계 마무리, 로드맵 갱신~~ (완료)
2. ~~버전 확정~~ (완료, 위 표)
3. **골격:** Gradle wrapper, `settings.gradle.kts`, `build.gradle.kts`(JDK 21 toolchain, Spring Boot, Data JPA, Flyway, PostgreSQL, JDA, jda-ktx, coroutines, MockK, Testcontainers, ktlint), `GrowthAssistantApplication`, `core`/`tutor` 패키지, `docker-compose.yml`(PostgreSQL 16), `application.yml`(+ test 프로필), `.env.example`, `.gitignore`에 `.env`, `.gitattributes`. 완료 조건: Testcontainers 컨텍스트 로딩 테스트가 통과(`./gradlew build`).
4. **Flyway V1:** `conversation_session`, `conversation_message`, `llm_call_log`, `app_setting` (스펙 5.5). JPA 엔티티·레포지토리 + Testcontainers 통합 테스트.
5. **`claude` CLI 스파이크:** 빈 작업 디렉터리에서 실제로 실행해 확인하고 출력을 `src/test/resources/fixtures/claude/`에 저장한다.
   - `--tools ""`가 도구를 모두 끄는지, `--setting-sources ""` + `--strict-mcp-config`가 설정을 격리하는지
   - `--output-format json` 기본 출력, `--json-schema` 출력 형태
   - WebSearch·WebFetch를 허용했을 때 출력 형태(출처 포함 여부)
   - 인증 오류·한도 초과 출력 형태 (재현이 어려우면 알려진 형식으로 픽스처를 만들고 표시)
   - ADR-0002와 다르면 구현 전에 합의하고 새 ADR을 쓴다.
6. **`core.llm`:** `ClaudeClient`, `ClaudeCliClient`(ProcessBuilder, 표준입력, CLI 경로 설정, 세마포어 2, 용도별 타임아웃 + 1회 재시도, JSON 깨짐 시 1회 재요청, 오류 분류 AUTH / RATE_LIMIT / TIMEOUT / INVALID_OUTPUT / UNKNOWN, `llm_call_log` 기록), 용도별 모델 설정, `FakeClaudeClient`, 픽스처 기반 파싱 테스트.
7. **`core.discord`:** JDA 빈(코루틴, Message Content Intent), 서버 전용 슬래시 명령(`/tutor`, `/end`), 소유자 ID 검사, 채널 자동 생성·ID 저장, 컴포넌트 ID 코덱, 지연 응답 헬퍼(15분 넘으면 일반 메시지), 2000자 분할, `#관리` 알림 포트. 코덱·분할은 단위 테스트.
8. **`tutor.conversation`:** `StartSession` / `HandleMessage` / `EndSession` / `CloseIdleSessions`(30분). 맥락은 세션 요약 + 최근 8개 메시지. 시스템 프롬프트 `src/main/resources/prompts/tutor-system.md`(스펙 7.5). 종료 시 요약 생성. JDA 없이 `FakeClaudeClient`로 테스트. 인증 오류 시 `#관리`에 1회 알림, 한도 초과 시 대화에 안내. 1단계에서는 개념·경험 카드 연결, `session_concept`, 확인 문제 버튼을 하지 않는다.
9. **운영 (Mac mini):** launchd plist(`ops/`), logback 로그 롤링, `docs/ops.md`, `README.md`.
10. **문서 갱신:** `CLAUDE.md`, `docs/architecture/c4-2-container.md`·`c4-3-component.md`, 스펙 7.6(채널 자동 생성), `docs/roadmap.md`.

**검증:** `docker compose up -d` 후 `./gradlew build`(단위·통합 테스트, ktlint). `./gradlew bootRun` 후 개인 서버에서 수동 점검: 채널 자동 생성, `/tutor`로 스레드 생성, 맥락 유지, 웹 검색 출처, 2000자 분할, `/end`와 30분 유휴 종료 시 요약 저장, 재시작 뒤 대화 이어가기, `claude` 로그아웃 시 `#관리` 알림, `llm_call_log` 기록.

1단계가 끝나면 `docs/roadmap.md`를 갱신하고 2단계(기억)의 세부 계획을 세운다.

## 미결 사항

- DDD_FE 레포의 프로젝트 범위 superpowers 설정 3건을 삭제할지 (팀 레포라 보류함)
- seokit 플러그인을 삭제할지
- 2단계 전에 정할 것: velog 사용자명, Notion 수집 범위, 용도별 Claude 모델 기본값, Notion Integration 토큰
