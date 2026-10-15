# 핸드오프

세션을 이어 갈 때 읽는 메모다. 진행 상태의 기준은 [로드맵](roadmap.md)이고, 이 파일에는 로드맵에 남기지 않는 맥락(다음에 할 일의 순서, 학습 진도, 조사 결론)만 둔다. 다 처리한 항목은 지운다.

**마지막 갱신:** 2026-10-15, 브랜치 `feat/tutor-instructions`

## 작업

1. **이 브랜치 PR 머지:** 튜터 지침(MCP instructions), Discord 코드 제거, quiz 레이어 폴더 결정(ADR-0020)
2. **맥미니 정리:** 예전에 `ops/install.sh`로 봇을 등록한 기기라면 `ops/uninstall.sh`를 한 번 실행한다. 지우지 않으면 launchd가 없는 `dist/main.js`를 계속 재시작한다
3. **Claude Desktop 등록 (로드맵 1단계):** `ops/deploy.sh`로 릴리스를 만들고, `claude_desktop_config.json`에서 `~/.growth-assistant/app/current/dist/mcp-stdio.js`를 띄우는 예시를 `docs/ops.md` 7번에 쓴다(`GROWTH_ENV_FILE`, `LOG_DIR` 포함)
4. **수동 점검 체크리스트:** Desktop 대화에서 `get_learning_context`, `record_study_note` 호출과 학습 기록 저장을 확인한다
5. **작은 정리:** `src/core/clock/clock.ts` 주석에 Discord 시절 표현("봇", "유휴 종료")이 남아 있다

## 학습 (현재 구현 이해하기)

사용자가 코드를 자기 말로 설명하면 피드백하고, 부족한 부분은 객관식 문제로 확인하는 방식으로 진행한다.

### 다룬 것

- **Nest 모듈:** 루트 모듈(`McpAppModule`)에서 시작하는 의존성 그래프, `imports`/`exports`, `@Global`(`DbModule`·`ClockModule`, `ConfigModule`의 `isGlobal`), 동적 모듈(`forRoot`)
- **루트 모듈의 각 import가 하는 일:** `ConfigModule`(환경 변수 읽기·zod 검증), `ClockModule`(현재 시각 포트), `DbModule`(pg 풀과 Drizzle 인스턴스, 테이블 정의는 기능 폴더의 `*.schema.ts`), `McpModule`(`McpServerHost`), `StudyModule`
- **MCP의 세 층:** 프로토콜 명세(JSON 메시지 모양) → SDK API(`McpServer`, `registerTool`, `connect`) → 우리 어댑터(`McpToolHandler`, `@McpTool()`). `McpServerHost`가 우리 어댑터를 SDK 호출로 바꾼다. "MCP 서버"는 SDK 패키지가 아니라 MCP 메시지를 주고받는 프로세스다
- **스키마가 Claude에 가는 경로:** zod → JSON Schema(`tools/list`) → 모델이 입력을 만들 때 참고. 실제 검사는 서버에서 SDK가 zod로 한다. `.describe()`는 사실상 프롬프트다

### 문제 결과 (5문제 중 2문제 맞힘)

| 문제 | 결과 | 보강할 개념 |
|---|---|---|
| Q1. `StudyModule`이 `DbModule`을 import하지 않아도 `DB`를 주입받는 이유 | 정답 | |
| Q2. import하지 않은 `LlmModule`의 `ClaudeClient`를 주입하면 | 오답(지연 로딩을 고름) | Nest는 시작할 때 모든 provider를 미리 만든다. 못 만들면 앱이 뜨지 않는다 |
| Q3. `Clock` 추상 클래스를 두는 이유 | 오답(성능을 고름) | 포트와 어댑터, 테스트에서 시각 고정. 추상 클래스는 실행 시점에도 남아 주입 토큰으로 쓸 수 있다 |
| Q4. 새 `@McpTool()` 도구를 노출하는 최소 조건 | 오답(`McpServerHost`를 직접 고침을 고름) | Discovery: 기능 모듈 `providers` 등록과 루트 `imports` 추가만 하면 된다 |
| Q5. zod 스키마 변경이 Claude에 전달되는 경로 | 정답 | |

Q2~Q4는 다음 학습 때 조건을 바꾼 문제로 다시 확인한다.

### 다음: `StudyModule` 내부 흐름

사용자가 먼저 설명하고 나서 피드백한다. 설명할 것:

- `record_study_note` 호출이 처리기 → 서비스 → 저장소 → DB로 내려가는 흐름
- 각 층이 맡는 일: `mcp/record-study-note.tool.ts`, `study-note.service.ts`, `study-note.ts`(도메인 규칙), `study-note.repository.ts`, `study-note.schema.ts`
- zod 입력 검증이 어디서 일어나는지, `Clock`이 어디서 쓰이는지

그다음 주제 후보는 테스트 구조(단위 테스트 `*.spec.ts`와 Testcontainers를 쓰는 `*.db.spec.ts`)와 `mcp-stdio.ts`의 시작·종료와 로그다.

## 조사 메모: LLM 제공자를 OpenAI로 바꿀지 (2026-10-15)

- **ChatGPT:** 커스텀 MCP 서버는 공개 HTTPS(Streamable HTTP)로 열거나 Secure MCP Tunnel로 연결해야 한다. 로컬 stdio를 직접 띄우는 방식은 없다. 바꾸면 5단계(원격 전환)를 지금 해야 한다
- **채팅 안 UI:** Claude(2026-01부터)와 ChatGPT 모두 공개 표준 MCP Apps를 구현한다. 객관식·빈칸 카드, 전체 화면의 노드 연결형(React Flow) 문제가 두 곳에서 같은 코드로 동작한다. Claude Desktop은 로컬 stdio 서버의 MCP Apps도 그린다. 모바일은 원격 커넥터에서만 된다
- **결론:** UI 때문에 바꿀 이유는 없다. 3단계 퀴즈에서 MCP Apps로 객관식 카드를 Claude Desktop에 붙여 본 뒤 다시 판단한다. 바꾸게 되면 ADR-0018을 대체하는 새 ADR을 쓴다
- 출처: [Claude MCP Apps 시작하기](https://claude.com/docs/connectors/building/mcp-apps/getting-started), [Claude MCP Apps 디자인 가이드](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines), [OpenAI Apps SDK UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui), [OpenAI 연결 방법](https://developers.openai.com/apps-sdk/deploy/connect-chatgpt)
