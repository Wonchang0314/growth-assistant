# 핸드오프

세션을 이어 갈 때 읽는 메모다. 진행 상태의 기준은 [로드맵](roadmap.md)이고, 이 파일에는 로드맵에 남기지 않는 맥락(다음에 할 일의 순서, 학습 진도, 조사 결론)만 둔다. 다 처리한 항목은 지운다.

**마지막 갱신:** 2026-10-17, `feat/concept-review` (맥미니에서)

## 작업

다음 세션은 1번부터 한다.

1. **시드 커리큘럼 (완료, PR #12·#13 머지·배포 2026-10-17, ADR-0022):** 트랙 6개(`js` 31, `database` 39, `backend` 30, `infra` 40, `network` 20, `mcp` 34 = 194개, 가중치 각 0.2는 상대 비율). 배포 뒤 DB 관계 350개로 YAML과 같았다. 그 뒤 학습 기록을 붙일 개념이 없어 `js`에 "Node 버전 관리"를 더했다(배포 전). 사용자가 YAML을 보며 고칠 개념이 있으면 고치고 다시 배포한다
2. **2단계 남은 순서 (2026-10-17 계획):** ① 경험 카드 추출(PR #21 머지) → ①-1 전체 백필(2026-10-17 시작) → ② 개념 승인 도구(`list_pending_concepts`, `review_concept`, 구현 끝 `feat/concept-review`. 머지 후 배포하고 Desktop에서 백필로 쌓인 승인 대기 개념을 검토한다, `docs/manual-check.md` 2단계) → ③ 판단 사례 추상화(회사 용어 목록 없이 패턴 게이트 + Opus 독립 검증, ADR-0024) → ④ `search_experience`·학습 맥락에 경험 카드. Notion 수집은 끝났다(문서 164개, 청크 2,420개, `npm run sync`). 용어 목록 PR(#18)은 ADR-0024로 닫았고 로컬 DB의 `domain_term`도 지웠다. Claude가 만든 용어 제안 파일 `~/.growth-assistant/domain-terms.tsv`가 남아 있다(쓰지 않음, 지울지는 사용자가 정한다)
   - **추출 시험 결과 (2026-10-17, 문서 1·24·32·42·66):** 카드 13장, 새 개념 5개(자동 승인 1, 승인 대기 4), 문서당 10~30초. 카드 내용(틀린 판단·되돌린 결정 포함)은 좋다. 처음 프롬프트는 새 개념을 하나도 제안하지 않고 가까운 개념에 끼워 맞췄고, 고친 뒤에는 제안하지만 별칭에 설정 키·사건 용어가 섞였다. 그래서 카드 나누는 기준(교훈이 다르면 나눔)과 이름·별칭 규칙(개념 하나, 다른 표기만)을 더했다. 남은 문제: "A와 B" 이름(기존 시드를 따라 함), 앞 문서에서 만든 개념을 다음 문서가 느슨하게 재사용("CI 잡 직렬화"가 배포 순서 사고 카드에 붙음). 프롬프트로 더 다듬기보다 ② 승인 도구에서 정리한다. 시험 결과 5개 문서는 DONE이라 백필이 다시 뽑지 않는다
   - **백필:** PR 머지 뒤 `npm run extract`를 백그라운드로(남은 약 159개, 1시간 안팎). 한도에 걸리면 남은 문서를 그대로 두고 멈추므로 다시 돌리면 이어서 한다. 끝나면 `sync_status`로 추출 상태별 문서 수를 확인한다
   - **개념 검토는 백필 직후에 한다:** 학습 기록이 붙은 개념은 병합하지 못한다(학습 기록 연결이 외래 키로 막는다. 학습 기록은 ACTIVE 개념에만 붙으므로 자동 승인 개념만 해당). 튜터 대화에 쓰이기 전에 자동 승인 개념부터 검토한다. 그래도 걸리면 병합 대신 고쳐서 승인하거나 중복 쪽을 거절한다. 학습 기록·숙련도·퀴즈까지 옮기는 병합은 3단계 숙련도를 만들 때 함께 설계한다(core가 tutor 테이블을 모르므로 포트가 필요하고, 숙련도·복습 일정을 합치는 규칙도 필요하다)
   - **개념 정리 (필요해지면):** 개념은 거의 지워지지 않고 쌓인다. 지워지는 경로는 시드에서 뺀 개념(db:seed)과 병합한 개념뿐이고, 거절은 같은 제안을 다시 만들지 않으려고 `REJECTED` 행으로 남긴다. 문서가 사라지면 카드는 지워지지만 그 문서에서 생긴 개념은 남는다(카드 0장). 개념이 수천 개가 되거나 4단계 매일 동기화로 문서 삭제가 잦아지면 ① 카드·학습 기록이 없는 승인 대기 개념 정리 ② 추출 프롬프트에 전체 목록 대신 관련 트랙 개념만 넣기를 검토한다
3. **퀴즈 형식:** 문제 내는 UI가 마음에 들지 않는다는 의견이 있었다. 퀴즈 UI는 3단계에서 MCP Apps로 만들기로 했다. 그 전에는 프로젝트 지침(`docs/claude-project-instructions.md`)의 형식 규칙(보기는 줄바꿈 목록, 한 번에 한 문제)으로 다듬는다

**맥미니 상태 (2026-10-17):** 예전 봇 launchd 해제함. Desktop 설정 `claude_desktop_config.json`에 `growth-assistant` 등록함(원본 백업 `.bak-20261017`), running 확인. Node는 `.nvmrc`(24.22.0)로 고정했고 최신 배포 릴리스는 `20261017-214842`, `app/node` 링크는 24.22.0을 가리킨다. Desktop 설정의 `command`를 `app/node` 링크로 바꾸고(백업 `.bak-20261017-node`) 다시 시작해 도구 3개(`sync_status` 포함)로 연결된 것을 확인했다. 1단계 체크리스트는 그 전에 떠 있던 옛 릴리스(`20261017-163436`, Node 24.13.1)로 확인했다. 앞으로 Node를 올려도 설정을 다시 넣지 않는다. 배포한 뒤에는 Desktop을 완전히 종료했다 다시 열어야 새 릴리스가 뜬다. mise는 아직 들이지 않았다(nvm이 `.nvmrc`를 그대로 읽고, Desktop 문제는 링크로 풀었으므로 도구를 바꿀 이유가 약하다)

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
