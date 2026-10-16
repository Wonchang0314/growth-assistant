# 핸드오프

세션을 이어 갈 때 읽는 메모다. 진행 상태의 기준은 [로드맵](roadmap.md)이고, 이 파일에는 로드맵에 남기지 않는 맥락(다음에 할 일의 순서, 학습 진도, 조사 결론)만 둔다. 다 처리한 항목은 지운다.

**마지막 갱신:** 2026-10-16, `docs/adr-0021-tracks-scenario` (PR #7 머지 뒤)

## 작업

맥미니 작업(1~3)은 귀가 후에 하고, 그사이 PC에서 2단계 준비(4~5)를 진행한다.

1. **맥미니 정리:** 예전에 `ops/install.sh`로 봇을 등록한 기기라면 `ops/uninstall.sh`를 한 번 실행한다. 지우지 않으면 launchd가 없는 `dist/main.js`를 계속 재시작한다
2. **맥미니에서 Desktop 등록:** `git pull && ops/deploy.sh` → `ops/desktop-config.sh` 출력을 Desktop 설정에 넣고 다시 시작한다 (`docs/ops.md` 처음 설치 7번). WSL에서는 Desktop이 하듯 최소 환경과 작업 디렉터리 `/`로 띄워 도구 목록·instructions·로그·DB 꺼짐 오류까지 확인했다. 실제 Desktop과 macOS 권한(레포가 `~/Documents` 아래인 경우)은 확인하지 못했다
3. **1단계 체크리스트 확인:** `docs/manual-check.md`. 끝나면 로드맵 1단계를 닫는다
4. **시드 YAML 초안:** 입력은 [시드 개념 후보](research/2026-10-16-seed-concept-candidates.md)다. 규모는 상위 개념 약 100개와 실수 기록(★)이 있는 하위 개념으로, 트랙마다 40~60개쯤이다. 나머지 하위 개념은 수집 때 `PART_OF`로 붙어 자동 승인되게 둔다. 개념 하나는 트랙 하나에만 넣고, 트랙에 걸친 관계는 `PREREQUISITE`·`RELATED`로 잇는다(ADR-0021). 초안을 사용자가 한 번 검토한다
5. **개념 그래프 구현 (PC 범위):** `core/knowledge`의 `track`·`concept`·`concept_edge` 스키마와 마이그레이션, 이름·별칭으로 찾기와 선수 체인(재귀 CTE) 저장소, 시드 적재 명령과 검증 테스트(이름 중복, 없는 개념 참조, 선수 관계 순환), `study_note_concept`, `get_learning_context`에 관련 개념과 선수 개념 추가. 숙련도는 3단계에서 붙인다

## 학습 (현재 구현 이해하기)

사용자가 코드를 자기 말로 설명하면 피드백하고, 부족한 부분은 객관식 문제로 확인하는 방식으로 진행한다.

### 다룬 것

- **Nest 모듈:** 루트 모듈(`McpAppModule`)에서 시작하는 의존성 그래프, `imports`/`exports`, `@Global`(`DbModule`·`ClockModule`, `ConfigModule`의 `isGlobal`), 동적 모듈(`forRoot`)
- **루트 모듈의 각 import가 하는 일:** `ConfigModule`(환경 변수 읽기·zod 검증), `ClockModule`(현재 시각 포트), `DbModule`(pg 풀과 Drizzle 인스턴스, 테이블 정의는 기능 폴더의 `*.schema.ts`), `McpModule`(`McpServerHost`), `StudyModule`
- **MCP의 세 층:** 프로토콜 명세(JSON 메시지 모양) → SDK API(`McpServer`, `registerTool`, `connect`) → 우리 어댑터(`McpToolHandler`, `@McpTool()`). `McpServerHost`가 우리 어댑터를 SDK 호출로 바꾼다. "MCP 서버"는 SDK 패키지가 아니라 MCP 메시지를 주고받는 프로세스다
- **스키마가 Claude에 가는 경로:** zod → JSON Schema(`tools/list`) → 모델이 입력을 만들 때 참고. 실제 검사는 서버에서 SDK가 zod로 한다. `.describe()`는 사실상 프롬프트다

- **`StudyModule` 내부 흐름 (2026-10-16):** 도구(들어오는 어댑터) → 서비스(유스케이스: 기록 시각, 값 정리, 조회 조합) → 저장소(나가는 어댑터: SQL, 행을 도메인 타입으로) → DB. 사용자 설명에서 흐름은 맞았다. 다만 provider를 "주입받는 것"으로 이해했고(실제로는 모듈이 만들어 내놓는 것), 도구의 반환값을 MCP 규격 JSON으로 봤다(실제로는 `{ text, data }`이고 변환은 Host가 한다)

- **테스트 구조 (2026-10-16):** 단위(`*.spec.ts`) / DB 통합(`*.db.spec.ts`, 실제 PostgreSQL) / 앱 전체(`test/mcp-app.module.db.spec.ts`, `Clock`과 전송만 바꿈). Vitest projects로 파일 이름에 따라 나눈다. db는 globalSetup이 컨테이너를 한 번 띄우고 마이그레이션을 적용한 뒤 `provide`/`inject`로 접속 정보를 넘기며, 파일을 차례로 실행하고 테스트마다 TRUNCATE한다. 가짜 객체(`FixedClock`, `FakeClaudeClient`), 녹화한 CLI 스트림, `overrideProvider`도 다뤘다. `StudyNoteService`와 도구 처리기는 따로 된 단위 테스트 없이 앱 전체 테스트로만 확인된다

### 문제 결과 (13문제 중 6문제 맞힘)

| 문제 | 결과 | 보강할 개념 |
|---|---|---|
| Q1. `StudyModule`이 `DbModule`을 import하지 않아도 `DB`를 주입받는 이유 | 정답 | |
| Q2. import하지 않은 `LlmModule`의 `ClaudeClient`를 주입하면 | 오답(지연 로딩을 고름) | Nest는 시작할 때 모든 provider를 미리 만든다. 못 만들면 앱이 뜨지 않는다 |
| Q3. `Clock` 추상 클래스를 두는 이유 | 오답(성능을 고름) | 포트와 어댑터, 테스트에서 시각 고정. 추상 클래스는 실행 시점에도 남아 주입 토큰으로 쓸 수 있다 |
| Q4. 새 `@McpTool()` 도구를 노출하는 최소 조건 | 오답(`McpServerHost`를 직접 고침을 고름) | Discovery: 기능 모듈 `providers` 등록과 루트 `imports` 추가만 하면 된다 |
| Q5. zod 스키마 변경이 Claude에 전달되는 경로 | 정답 | |
| Q6. export하지 않은 도구를 Host가 찾는 이유 | 오답(`@McpTool`이 자동 export를 고름) | `exports`는 다른 모듈이 주입할 수 있는 범위만 정한다. Discovery는 컨테이너의 모든 provider를 훑는다 |
| Q7. QuizModule이 학습 기록을 읽는 방법 | 오답(MCP 도구 호출을 고름) | 모듈 사이는 `imports` + export된 서비스 주입. MCP 도구는 Claude가 부르는 바깥 입구다 |
| Q8. `createdAt`을 `clock.now()`로 넣는 이유 | 정답 (Q3 다시 확인 통과) | |
| Q9. `confusedPoints`를 빼고 부르면 `handle()`이 받는 값 | 오답(`undefined`를 고름) | SDK가 zod로 파싱한 결과(`z.output`)를 넘기므로 `.default([])`가 적용된 `[]`가 들어온다 |

| Q10. `.db`를 빼고 이름 지은 DB 테스트를 unit으로 돌리면 | 정답 | |
| Q11. db 프로젝트의 `fileParallelism: false`를 지우면 | 정답 | |
| Q12. `overrideProvider(Clock)`이 동작하는 이유와 거리가 먼 것 | 오답(2를 고름. "거리가 먼"을 놓친 것으로 보임) | 바꿔 끼우기가 효과를 내려면 대상 코드가 포트를 주입받아야 한다(`new Date()`를 직접 부르면 바꿔도 소용없다) |
| Q13. 출제 규칙을 테스트하는 방법 | 정답 (Q7 다시 확인 통과: 서비스를 주입받는 구조) | |

Q6(`exports`와 Discovery의 차이)과 Q9(zod 파싱 결과가 넘어옴)를 다음 학습 때 조건을 바꿔 다시 확인한다.

### 다음 주제 후보

`mcp-stdio.ts`의 시작·종료와 로그, `core/llm`(`ClaudeCliClient`, 스트림 파서, 호출 로그).

## 조사 메모: LLM 제공자를 OpenAI로 바꿀지 (2026-10-15)

- **ChatGPT:** 커스텀 MCP 서버는 공개 HTTPS(Streamable HTTP)로 열거나 Secure MCP Tunnel로 연결해야 한다. 로컬 stdio를 직접 띄우는 방식은 없다. 바꾸면 5단계(원격 전환)를 지금 해야 한다
- **채팅 안 UI:** Claude(2026-01부터)와 ChatGPT 모두 공개 표준 MCP Apps를 구현한다. 객관식·빈칸 카드, 전체 화면의 노드 연결형(React Flow) 문제가 두 곳에서 같은 코드로 동작한다. Claude Desktop은 로컬 stdio 서버의 MCP Apps도 그린다. 모바일은 원격 커넥터에서만 된다
- **결론:** UI 때문에 바꿀 이유는 없다. 3단계 퀴즈에서 MCP Apps로 객관식 카드를 Claude Desktop에 붙여 본 뒤 다시 판단한다. 바꾸게 되면 ADR-0018을 대체하는 새 ADR을 쓴다
- 출처: [Claude MCP Apps 시작하기](https://claude.com/docs/connectors/building/mcp-apps/getting-started), [Claude MCP Apps 디자인 가이드](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines), [OpenAI Apps SDK UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui), [OpenAI 연결 방법](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
