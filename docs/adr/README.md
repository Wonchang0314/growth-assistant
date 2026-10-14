# 결정 기록 (ADR)

되돌리기 어렵거나 이유를 나중에 다시 확인해야 할 결정을 기록한다. 채택된 ADR은 고치지 않고, 결정이 바뀌면 새 ADR을 쓰고 이전 ADR의 상태를 `대체됨`으로 바꾼다. 형식은 [0000-template.md](0000-template.md)를 따른다.

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-kotlin-spring-standalone.md) | Kotlin + Spring Boot 독립 프로젝트로 만든다 | 대체됨(0014) |
| [0002](0002-claude-cli-subscription.md) | LLM은 `claude` CLI 서브프로세스로 호출한다 | 대체됨(0012) |
| [0003](0003-discord-jda-private-server.md) | Discord 개인 서버를 인터페이스로, JDA를 사용한다 | 대체됨(0014) |
| [0004](0004-postgres-single-store.md) | PostgreSQL 단일 저장소, 그래프 DB를 쓰지 않는다 | 채택 |
| [0005](0005-no-embeddings-controlled-vocabulary.md) | 임베딩 없이 통제 어휘 개념 태그로 검색한다 | 채택 |
| [0006](0006-ingestion-backfill-incremental.md) | 기억은 1회 백필 후 청크 단위 증분 동기화한다 | 채택 |
| [0007](0007-concept-approval-policy.md) | 개념 승인: 백필은 조건부 자동, 증분은 자동 + 안전장치 | 채택 |
| [0008](0008-fsrs-concept-level.md) | 간격 반복은 FSRS, 복습 단위는 개념 | 대체됨(0016) |
| [0009](0009-mastery-by-code.md) | 숙련도는 코드가 계산하고, 힌트 없는 응답만 인정한다 | 채택 |
| [0010](0010-local-mac-hosting.md) | 사용자의 Mac에서 launchd로 상시 실행한다 | 채택 |
| [0011](0011-documentation-approach.md) | 문서는 C4 + ADR, 작업 계획은 세션 안에서 관리한다 | 채택 |
| [0012](0012-claude-cli-stream-json.md) | `claude` CLI를 `stream-json` 출력으로 호출한다 | 채택 |
| [0013](0013-feature-packages-pragmatic-hexagonal.md) | 기능별 패키지에 외부 경계만 포트·어댑터로 분리한다 | 대체됨(0015) |
| [0014](0014-nestjs-typescript.md) | NestJS + TypeScript로 전환한다 | 일부 대체됨(0017·0018) |
| [0015](0015-nest-feature-modules.md) | 기능별 Nest 모듈에 외부 경계만 포트·어댑터로 분리하고, 도메인 규칙은 저장 형식과 떼어 둔다 | 일부 대체됨(0017·0018) |
| [0016](0016-fsrs-ts-fsrs.md) | FSRS는 ts-fsrs 라이브러리를 쓰고, 복습 단위는 개념으로 유지한다 | 채택 |
| [0017](0017-pwa-http-api.md) | Discord 대신 PWA를 인터페이스로, 앱은 HTTP API 서버로 바꾼다 | 대체됨(0018) |
| [0018](0018-claude-mcp-server.md) | PWA 대신 Claude 앱을 인터페이스로, 앱은 MCP 서버로 바꾸고 먼저 로컬에서 검증한다 | 일부 대체됨(0019) |
| [0019](0019-core-learning-first.md) | 핵심 학습 기능을 먼저 만들고, 퀴즈는 객관식·빈칸부터, 먼저 말 걸기·알림·인증·보안은 뒤로 미룬다 | 채택 |
