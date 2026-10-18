# C4 레벨 3: 컴포넌트 (NestJS 애플리케이션)

`core`는 여러 기능 모듈이 공유하는 기반이고, `tutor`는 첫 기능 모듈이다. 이후 `career` 모듈(이력서·포트폴리오)이 `core`를 공유하며 추가될 예정이다.

```mermaid
flowchart TB
    subgraph core
        mcp["mcp<br/>MCP 서버, 도구 처리기 탐색, HTTP 전송"]
        llm["llm<br/>ClaudeClient"]
        logging["logging<br/>로거, 운영 알림 (AdminNotifier)"]
        memory["memory<br/>문서·청크·경험 카드·판단 사례"]
        knowledge["knowledge<br/>트랙, 개념 그래프, 시드 적재"]
        ingestion["ingestion<br/>Notion 수집, 경험 카드 추출, 판단 사례 추상화, 개념 검토"]
        scheduler["scheduler<br/>예약 작업, 놓친 실행 복구"]
        setting["setting<br/>키-값 설정 (출제 지침 등)"]
    end

    subgraph tutor
        study["study<br/>학습 맥락 조회, 경험 카드 검색, 학습 기록"]
        quiz["quiz<br/>출제·검증·채점"]
        mastery["mastery<br/>FSRS, 숙련도·약점"]
        outreach["outreach<br/>아침 복습·저녁 주제·주간 리포트"]
    end

    mcp -.->|"@McpTool() 탐색"| study
    mcp -.->|"@McpTool() 탐색"| quiz
    scheduler --> outreach
    scheduler --> ingestion
    llm -->|"인증 만료 알림"| logging
    quiz -->|"출제 지침"| setting

    ingestion --> llm
    ingestion --> memory
    ingestion --> knowledge

    study --> memory
    study --> knowledge
    study --> mastery

    quiz --> llm
    quiz --> mastery
    quiz --> memory
    quiz --> knowledge
    quiz --> study

    mastery --> knowledge
    outreach --> quiz
    outreach --> mastery
```

## 의존 규칙

- `tutor` → `core` 방향으로만 의존한다. `core`는 `tutor`를 모른다.
- `tutor` 하위 모듈끼리는 화살표 방향으로만 의존한다. 순환 의존을 만들지 않는다.
- 유스케이스는 MCP SDK 객체를 받지 않는다. 도구 처리기가 zod로 검증된 값을 넘기고, 결과를 요약 텍스트와 구조화된 내용으로 돌려준다.
- `core/mcp`는 `@McpTool()`이 붙은 provider를 `DiscoveryService`로 모아 등록한다(점선: 의존이 아니라 탐색). 기능 모듈은 `core/mcp`를 import하지 않는다. `McpServerHost`는 연결(stdio)이나 HTTP 요청마다 도구를 모두 단 새 SDK 서버를 만들고, `listenMcpHttp`가 `createMcpHandler`로 Streamable HTTP를 받는다. 진입점은 전송만 고른다.
- 외부 시스템과 닿는 경계만 포트·어댑터로 분리한다 ([ADR-0015](../adr/0015-nest-feature-modules.md)). 유스케이스는 `ClaudeClient`·`AdminNotifier`·`DocumentSource`(Notion 어댑터) 같은 포트에만 의존하고, 기능 모듈의 MCP 도구 처리기는 그 모듈의 `mcp/` 폴더에 둔다. `quiz` 모듈만 모듈 안을 레이어 폴더로 나누고 폴더별 린트로 의존 방향을 강제한다 ([ADR-0020](../adr/0020-quiz-layered-folders.md)).
- 도메인 규칙은 순수 함수로 두고, 저장소는 기능 모듈 안에서 Drizzle을 직접 써서 행과 도메인 타입을 변환한다.
- `core`가 `tutor`를 가져오지 못하게 ESLint `no-restricted-imports`로 막는다.
- `quiz` 안에서는 application이 출력 포트(`QuizQuestionRepository`, `QuestionGenerator`)를 두고 infrastructure가 구현한다(ADR-0029). `quiz`는 학습 기록의 헷갈린 점을 `study`에서, 경험 카드를 `memory`에서, 개념 요약을 `knowledge`에서 읽어 출제에 넣고, 보기 길이·패턴 게이트는 `ingestion`의 순수 함수(`case-gate.ts`)를 함께 쓴다. 복습 개념은 `mastery`(예정일·약점·일정 없는 개념)와 `study`(아직 확인하지 않은 CONFUSED)에서 고르고, 채점 결과는 `mastery`에 넘긴다. 풀에 없는 문제는 MCP 서버 프로세스 안에서 뒤에서 만든다(ADR-0030). 약점 보고(`get_weakness`)도 풀이 기록을 가진 `quiz`에 두고, 근본 원인은 `knowledge`의 선수 관계와 `mastery`의 점수로 찾는다(ADR-0031).
- 숙련도·약점 점수와 복습 일정은 `mastery`의 코드가 결정적으로 계산한다. `llm`은 생성과 채점만 한다. `ts-fsrs`는 `mastery/fsrs.ts` 어댑터에서만 부른다(ADR-0016). `study`는 학습 기록에서 다룬 개념을 `MasteryService.introduce`로 복습 일정에 넣고, `quiz`는 채점 결과를 `recordAnswer`로 넘긴다(ADR-0028).
- 개념 병합은 `core`에 있지만 `tutor` 데이터(학습 기록 연결, 복습 일정)도 옮겨야 한다. `core/knowledge`의 병합 참여 포트(`ConceptMergeParticipants`)에 `study`·`mastery`가 모듈 시작 때 자기 저장소를 등록하고, 병합 트랜잭션이 이들을 부른다. 의존은 `tutor` → `core` 방향 그대로다.
