# 핸드오프

세션을 이어 갈 때 읽는 메모다. 진행 상태의 기준은 [로드맵](roadmap.md)이고, 이 파일에는 로드맵에 남기지 않는 맥락(다음에 할 일의 순서, 학습 진도, 조사 결론)만 둔다. 다 처리한 항목은 지운다.

**마지막 갱신:** 2026-10-18 21:30, `main` (맥미니에서). 가정 사례 폴백(ADR-0026), 보기 길이 게이트(1.5배), `claude -p` 동시 실행 5개(ADR-0027) 머지·배포 뒤 판단 사례 전체 실행을 끝냈다(19:56~21:23). FSRS·숙련도(PR #36)도 머지됐다(배포 전). 다음 세션은 아래 1번부터

## 작업

다음 세션은 1번부터 한다. 따로 적지 않았으면 각 항목은 PR 하나다.

1. **FSRS·숙련도 배포 (PR #36, ADR-0028, 2026-10-18 21:07 머지):** 마이그레이션 0008(`concept_mastery`)과 `package.json`이 바뀌었으므로 `ops/deploy.sh`로 배포하고 Desktop을 완전히 종료했다 다시 연다. 같은 세션이 워크트리(`.claude/worktrees/`, 브랜치 `claude/quiz-generation`)에서 다음 작업을 하고 있다. 이 체크아웃의 Prettier·ESLint는 그 폴더를 검사하지 않는다
2. **판단 사례 PENDING 8장 검토 (Desktop):** `docs/manual-check.md` 2단계 "판단 사례 검토". 사례 대부분은 "경험 사례:"와 "가정 사례:" 두 쪽 이유가 있다. 가정 사례가 "가정한 상황"으로 소개되는지도 본다. 결과로 체크리스트를 채운다
   - **전체 실행 결과 (2026-10-18):** 경험 카드 545장 모두 선별(판단 있음 273), 판단 사례 279개(ACTIVE 271: 경험 155·가정 116 / PENDING 8). 실패 0, 사용량 한도 멈춤 없음. 약 1시간 30분(5장 동시 처리), 호출 Sonnet 633·Opus 540. 개념이 없는 카드에서 나온 사례가 1개 있다
   - **길이 게이트 배수:** 1.3배였던 첫 50장은 경험 36%, 1.5배로 늦춘 뒤 묶음들은 경험 55~60%
   - **남은 품질 문제 (출제 전에 볼 것):** 소문자 컬럼·메서드 이름 누출(`first_seen_at`, `medianOf`)은 패턴 게이트가 못 잡고 검증이 잡는다. 패턴 게이트가 공개 SQL 함수 `PERCENTILE_CONT`를 사내 식별자로 건 오탐이 1건 있었다. 정답이 첫 보기인 경우가 많아 3단계 출제에서 보기를 섞는다. 가정 사례 정답의 옳고 그름은 Opus 일반 지식에 기댄다(ADR-0026)
   - **노션:** 복습 › MCP › "판단 사례 추상화 현재 상황 (2026-10-18)"에 폴백·첫 50장·전체 결과를 덧붙였다
3. **2단계 완료 확인 (사용자, Desktop):** `docs/manual-check.md` 2단계 "경험 카드". 새 대화에서 "서버 캐시 공부하자"·"운영 중 스키마 변경 공부하자"로 Claude가 경험을 한두 문장으로 인용하는지, "내가 겪은 인덱스 사고 사례 보여줘"·"keepPreviousData 겪었던 거"로 `search_experience`가 원하는 카드를 주는지. 2026-10-18 01:25~01:26에 `get_learning_context`·`search_experience`가 한 번씩 불렸지만 인용 여부는 사용자 답을 아직 못 받았다. 확인되면 체크리스트 기록 표를 채우고 로드맵의 "2단계 완료 확인"을 체크한다. 튜터 프로젝트 지침을 `docs/claude-project-instructions.md` 새 본문(경험 카드 한 줄 추가)으로 바꿨는지도 확인한다
4. **프로젝트를 iCloud 동기화 밖으로 옮기기 (사용자와 정하기):** `~/Desktop` 아래라 동기화 복사본(" 2", " 3" 붙은 파일)이 두 번 생겼다(2026-10-18 00:17 13개, 01:3x 18개. 모두 이번 작업 파일의 옛 버전이라 scratchpad로 옮겼다). `git status`에 untracked로 보이거나 `npm run check`·배포 타입 검사가 `* 2.ts`에서 깨지면 이것이다. 옮기면 `.env` 경로(Desktop 설정의 `GROWTH_ENV_FILE`)와 `ops/desktop-config.sh` 출력으로 Desktop 설정을 함께 바꾼다
5. **퀴즈 형식 (3단계):** 문제 내는 UI가 마음에 들지 않는다는 의견이 있었다. 퀴즈 UI는 3단계에서 MCP Apps로 만들기로 했다. 그 전에는 프로젝트 지침의 형식 규칙(보기는 줄바꿈 목록, 한 번에 한 문제)으로 다듬는다

### 2단계 현재 상태 (2026-10-18)

- **수집·추출:** Notion 문서 164개(청크 2,420개) 모두 추출 DONE, 경험 카드 545장. 추출은 문서당 `claude -p`(Sonnet) 한 번, 백필 74분. 카드 538장이 승인된 개념에 연결돼 학습 맥락에 나올 수 있다. 용어 목록은 쓰지 않는다(ADR-0024). Claude가 만든 용어 제안 파일 `~/.growth-assistant/domain-terms.tsv`가 남아 있다(쓰지 않음, 지울지는 사용자가 정한다)
- **개념 검토 끝 (2026-10-18):** 수집에서 생긴 개념 81개 → 승인 64, 거절 12, 병합 5(메모이제이션 의존성 → 훅 의존성 배열, 훅 구독 경계와 리렌더 범위 → React 리렌더링, attribute와 uniform → WebGL 렌더링 모델, 유휴 시간 작업 스케줄링 → 메인 스레드 블로킹, 데이터 소스 이전 시 필드 패리티 검증 → 데이터 동기화). 승인 대기 0. 주요 이름 변경: 폴링 동기화와 백필 → 데이터 동기화(카드 49장), TanStack Query Observer와 캐시 구조 → TanStack Query, 리렌더링과 참조 안정 → React 리렌더링, atom 기반 전역 상태 → 전역 상태 관리, long task와 INP → 메인 스레드 블로킹, 결정 기록과 문서 동기화 → 아키텍처 결정 기록. 거절: deck.gl updateTriggers, 인쇄용 CSS, 서비스 레지스트리, CSS 폭 키워드, 텍스트 말줄임, 일회용 객체 재사용 금지, 조건부 마운트 대 가시성 토글, MapLibre, CI 게이트 에러 허용 목록, 파비콘, 클래스 정적 초기화, 단위 환산과 정합. 거절된 개념의 카드도 `search_experience` 글자 검색으로는 찾는다
- **추출 프롬프트에서 배운 것 (2026-10-17 시험):** 처음엔 새 개념을 제안하지 않고 가까운 개념에 끼워 맞췄고, 고친 뒤엔 별칭에 설정 키·사건 용어가 섞였다. 카드 나누는 기준(교훈이 다르면 나눔)과 이름·별칭 규칙(개념 하나, 다른 표기만)을 더했다. 그래도 "A와 B" 이름(기존 시드를 따라 함)과 앞 문서에서 만든 개념의 느슨한 재사용이 남아 검토 도구로 정리했다
- **개념 병합:** 학습 기록 연결과 복습 일정(`concept_mastery`)은 병합 참여 포트로 함께 옮긴다(ADR-0028, 설계 문서 5.3). MCP 서버(`review_concept`)에서만 참여자가 등록되므로 수집 CLI에서 병합하면 외래 키가 막는다. 퀴즈 문제·풀이는 `quiz`를 만들 때 같은 포트에 참여시킨다
- **개념 정리 (필요해지면):** 개념은 거의 지워지지 않고 쌓인다. 지워지는 경로는 시드에서 뺀 개념(db:seed)과 병합한 개념뿐이고, 거절은 같은 제안을 다시 만들지 않으려고 `REJECTED` 행으로 남긴다. 문서가 사라지면 카드는 지워지지만 그 문서에서 생긴 개념은 남는다(카드 0장). 개념이 수천 개가 되거나 4단계 매일 동기화로 문서 삭제가 잦아지면 ① 카드·학습 기록이 없는 승인 대기 개념 정리 ② 추출 프롬프트에 전체 목록 대신 관련 트랙 개념만 넣기를 검토한다

**맥미니 상태 (2026-10-18):** 예전 봇 launchd 해제함. Desktop 설정 `claude_desktop_config.json`에 `growth-assistant` 등록함(원본 백업 `.bak-20261017`), running 확인. Node는 `.nvmrc`(24.22.0)로 고정했고 최신 배포 릴리스는 `20261018-143127`(PR #31까지, 도구 8개), `app/node` 링크는 24.22.0을 가리킨다. 동기화 복사본 문제는 작업 4번. Desktop 설정의 `command`를 `app/node` 링크로 바꾸고(백업 `.bak-20261017-node`) 다시 시작해 도구 3개(`sync_status` 포함)로 연결된 것을 확인했다. 1단계 체크리스트는 그 전에 떠 있던 옛 릴리스(`20261017-163436`, Node 24.13.1)로 확인했다. 앞으로 Node를 올려도 설정을 다시 넣지 않는다. 배포한 뒤에는 Desktop을 완전히 종료했다 다시 열어야 새 릴리스가 뜬다. mise는 아직 들이지 않았다(nvm이 `.nvmrc`를 그대로 읽고, Desktop 문제는 링크로 풀었으므로 도구를 바꿀 이유가 약하다)

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
