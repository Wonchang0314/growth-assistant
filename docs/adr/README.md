# 결정 기록 (ADR)

되돌리기 어렵거나 이유를 나중에 다시 확인해야 할 결정을 기록한다. 채택된 ADR은 고치지 않고, 결정이 바뀌면 새 ADR을 쓰고 이전 ADR의 상태를 `대체됨`으로 바꾼다. 형식은 [0000-template.md](0000-template.md)를 따른다.

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-kotlin-spring-standalone.md) | Kotlin + Spring Boot 독립 프로젝트로 만든다 | 대체됨(0014) |
| [0002](0002-claude-cli-subscription.md) | LLM은 `claude` CLI 서브프로세스로 호출한다 | 대체됨(0012) |
| [0003](0003-discord-jda-private-server.md) | Discord 개인 서버를 인터페이스로, JDA를 사용한다 | 대체됨(0014) |
| [0004](0004-postgres-single-store.md) | PostgreSQL 단일 저장소, 그래프 DB를 쓰지 않는다 | 채택 |
| [0005](0005-no-embeddings-controlled-vocabulary.md) | 임베딩 없이 통제 어휘 개념 태그로 검색한다 | 채택 |
| [0006](0006-ingestion-backfill-incremental.md) | 기억은 1회 백필 후 청크 단위 증분 동기화한다 | 일부 대체됨(0023) |
| [0007](0007-concept-approval-policy.md) | 개념 승인: 백필은 조건부 자동, 증분은 자동 + 안전장치 | 채택 |
| [0008](0008-fsrs-concept-level.md) | 간격 반복은 FSRS, 복습 단위는 개념 | 대체됨(0016) |
| [0009](0009-mastery-by-code.md) | 숙련도는 코드가 계산하고, 힌트 없는 응답만 인정한다 | 채택 |
| [0010](0010-local-mac-hosting.md) | 사용자의 Mac에서 launchd로 상시 실행한다 | 채택 |
| [0011](0011-documentation-approach.md) | 문서는 C4 + ADR, 작업 계획은 세션 안에서 관리한다 | 채택 |
| [0012](0012-claude-cli-stream-json.md) | `claude` CLI를 `stream-json` 출력으로 호출한다 | 일부 대체됨(0027) |
| [0013](0013-feature-packages-pragmatic-hexagonal.md) | 기능별 패키지에 외부 경계만 포트·어댑터로 분리한다 | 대체됨(0015) |
| [0014](0014-nestjs-typescript.md) | NestJS + TypeScript로 전환한다 | 일부 대체됨(0017·0018) |
| [0015](0015-nest-feature-modules.md) | 기능별 Nest 모듈에 외부 경계만 포트·어댑터로 분리하고, 도메인 규칙은 저장 형식과 떼어 둔다 | 일부 대체됨(0017·0018·0020) |
| [0016](0016-fsrs-ts-fsrs.md) | FSRS는 ts-fsrs 라이브러리를 쓰고, 복습 단위는 개념으로 유지한다 | 일부 대체됨(0028) |
| [0017](0017-pwa-http-api.md) | Discord 대신 PWA를 인터페이스로, 앱은 HTTP API 서버로 바꾼다 | 대체됨(0018) |
| [0018](0018-claude-mcp-server.md) | PWA 대신 Claude 앱을 인터페이스로, 앱은 MCP 서버로 바꾸고 먼저 로컬에서 검증한다 | 일부 대체됨(0019·0034) |
| [0019](0019-core-learning-first.md) | 핵심 학습 기능을 먼저 만들고, 퀴즈는 객관식·빈칸부터, 먼저 말 걸기·알림·인증·보안은 뒤로 미룬다 | 일부 대체됨(0034) |
| [0020](0020-quiz-layered-folders.md) | quiz 모듈에서 레이어 폴더 구조를 먼저 시도한다 | 일부 대체됨(0029) |
| [0021](0021-tracks-and-decision-cases.md) | 학습 트랙에 IT 인프라를 더하고 가중치를 다시 나누며, 업무 경험은 회사 맥락을 걷어낸 판단 사례로 바꿔 상황 판단형 객관식으로 낸다 | 일부 대체됨(0022·0024·0026) |
| [0022](0022-seed-as-curriculum.md) | 시드 개념을 앞으로 배울 커리큘럼으로 바꾸고, 트랙을 JS/TS·관계형 DB·백엔드·IT 인프라·네트워크·MCP로 다시 짠다 | 일부 대체됨(0025) |
| [0023](0023-notion-only-source.md) | 기억의 원천은 Notion 하나로 하고 velog 수집은 하지 않는다 | 채택 |
| [0024](0024-abstraction-without-term-list.md) | 판단 사례 추상화에 회사 용어 목록을 쓰지 않고, 모양 패턴 검사와 독립 검증으로 회사 맥락을 걸러낸다 | 채택 |
| [0025](0025-ingested-frontend-gis-and-ops-parents.md) | 수집한 경험의 프런트엔드·GIS 개념을 받고, 운영 경험을 묶을 상위 개념 3개를 시드에 둔다 | 채택 |
| [0026](0026-experience-and-hypothetical-cases.md) | 판단 사례를 경험 사례와 가정 사례로 나누고, 경험 사례가 검증에 걸리면 가정 사례로 자동 폴백한다 | 채택 |
| [0027](0027-claude-concurrency-five.md) | `claude -p` 동시 실행을 5개로 올리고, 판단 사례는 카드를 그만큼 함께 처리한다 | 채택 |
| [0028](0028-fsrs-days-only-and-mastery-formula.md) | FSRS 단기 학습 단계를 끄고 최대 간격을 180일로 줄이며, 대화에서 다룬 개념을 복습 일정에 넣고, 숙련도·약점 공식과 개념 병합 규칙을 정한다 | 채택 |
| [0029](0029-quiz-generation-and-layer-ports.md) | 객관식·빈칸은 Sonnet이 쓰고 Opus가 정답을 모른 채 풀어 검증하며, quiz 레이어는 저장소·출제 어댑터를 포트로 둔다 | 일부 대체됨(0033) |
| [0030](0030-review-set-background-generation.md) | 복습 문제는 풀에 있는 것만 바로 내고, 없는 개념의 문제는 뒤에서 만든다 | 채택 |
| [0031](0031-weakness-report-and-root-causes.md) | 약점 보고는 퀴즈 모듈에 두고, 근본 원인은 약점 개념의 선수 개념 중 확인되지 않은 것으로 정하며, 지난주 대비는 4단계로 미룬다 | 일부 대체됨(0033) |
| [0032](0032-scenario-questions.md) | 상황 판단형 문제는 개념 문제와 번갈아 내고, 가정 사례는 코드가 머리말을 붙이며, 경험 카드는 사례 종류에 따라 다른 말로 잇는다 | 일부 대체됨(0033) |
| [0033](0033-quiz-policy-after-first-trial.md) | 출제에 웹 검색을 쓰고, 근본 원인은 약점 둘 이상이 기댈 때만 고르며, 상황 판단형은 개념 문제 둘마다 하나 내고, 빈칸은 복습에서 뺀다 | 채택 |
| [0034](0034-prototype-before-quality.md) | 퀴즈 품질 점검보다 원격 전환과 예약 작업으로 프로토타입을 먼저 만들고, 품질은 실제로 쓰면서 올린다 | 채택 |
