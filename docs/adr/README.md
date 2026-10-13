# 결정 기록 (ADR)

되돌리기 어렵거나 이유를 나중에 다시 확인해야 할 결정을 기록한다. 채택된 ADR은 고치지 않고, 결정이 바뀌면 새 ADR을 쓰고 이전 ADR의 상태를 `대체됨`으로 바꾼다. 형식은 [0000-template.md](0000-template.md)를 따른다.

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-kotlin-spring-standalone.md) | Kotlin + Spring Boot 독립 프로젝트로 만든다 | 채택 |
| [0002](0002-claude-cli-subscription.md) | LLM은 `claude` CLI 서브프로세스로 호출한다 | 대체됨(0012) |
| [0003](0003-discord-jda-private-server.md) | Discord 개인 서버를 인터페이스로, JDA를 사용한다 | 채택 |
| [0004](0004-postgres-single-store.md) | PostgreSQL 단일 저장소, 그래프 DB를 쓰지 않는다 | 채택 |
| [0005](0005-no-embeddings-controlled-vocabulary.md) | 임베딩 없이 통제 어휘 개념 태그로 검색한다 | 채택 |
| [0006](0006-ingestion-backfill-incremental.md) | 기억은 1회 백필 후 청크 단위 증분 동기화한다 | 채택 |
| [0007](0007-concept-approval-policy.md) | 개념 승인: 백필은 조건부 자동, 증분은 자동 + 안전장치 | 채택 |
| [0008](0008-fsrs-concept-level.md) | 간격 반복은 FSRS, 복습 단위는 개념 | 채택 |
| [0009](0009-mastery-by-code.md) | 숙련도는 코드가 계산하고, 힌트 없는 응답만 인정한다 | 채택 |
| [0010](0010-local-mac-hosting.md) | 사용자의 Mac에서 launchd로 상시 실행한다 | 채택 |
| [0011](0011-documentation-approach.md) | 문서는 C4 + ADR, 작업 계획은 세션 안에서 관리한다 | 채택 |
| [0012](0012-claude-cli-stream-json.md) | `claude` CLI를 `stream-json` 출력으로 호출한다 | 채택 |
