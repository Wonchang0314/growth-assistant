# C4 레벨 3: 컴포넌트 (Spring Boot 애플리케이션)

`core`는 여러 기능 모듈이 공유하는 기반이고, `tutor`는 첫 기능 모듈이다. 이후 `career` 모듈(이력서·포트폴리오)이 `core`를 공유하며 추가될 예정이다.

```mermaid
flowchart TB
    subgraph core
        discordGw["discord<br/>이벤트 라우팅, 응답 헬퍼,<br/>컴포넌트 ID 코덱"]
        llm["llm<br/>ClaudeClient"]
        memory["memory<br/>문서·청크·경험 카드"]
        knowledge["knowledge<br/>트랙, 개념 그래프"]
        ingestion["ingestion<br/>Notion·velog 수집"]
        scheduler["scheduler<br/>예약 작업, 놓친 실행 복구"]
    end

    subgraph tutor
        conversation["conversation<br/>튜터링 대화"]
        quiz["quiz<br/>출제·검증·채점"]
        mastery["mastery<br/>FSRS, 숙련도·약점"]
        outreach["outreach<br/>아침 복습·저녁 주제·주간 리포트"]
    end

    discordGw --> conversation
    discordGw --> quiz
    scheduler --> outreach
    scheduler --> ingestion

    ingestion --> llm
    ingestion --> memory
    ingestion --> knowledge

    conversation --> llm
    conversation --> memory
    conversation --> knowledge
    conversation --> mastery

    quiz --> llm
    quiz --> mastery
    quiz --> memory

    mastery --> knowledge
    outreach --> quiz
    outreach --> mastery
    outreach --> discordGw
```

## 의존 규칙

- `tutor` → `core` 방향으로만 의존한다. `core`는 `tutor`를 모른다.
- `tutor` 하위 모듈끼리는 화살표 방향으로만 의존한다. 순환 의존을 만들지 않는다.
- 유스케이스는 JDA 객체를 받지 않는다. `discord`가 DTO로 바꿔 넘긴다.
- 숙련도·약점 점수와 복습 일정은 `mastery`의 코드가 결정적으로 계산한다. `llm`은 생성과 채점만 한다.
