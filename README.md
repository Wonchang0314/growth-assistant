# growth-assistant

사용자가 공부하는 분야의 학습 기록과 개념 그래프를 기억하고, 약점 보완과 다음 학습을 이끄는 개인 AI 어시스턴트. 첫 모듈은 튜터(퀴즈·간격 반복·튜터링 대화·먼저 말 걸기)이고, Claude 앱에 붙이는 MCP 서버로 쓴다([ADR-0018](docs/adr/0018-claude-mcp-server.md)). 튜터링 대화는 Claude 앱이 하고, 이 서버는 학습 기록과 개념 그래프를 다루는 도구를 제공한다. LLM은 Claude 구독(Claude 앱, `claude -p` CLI)으로만 쓰고 API 키는 쓰지 않는다.

**지금 되는 것:** Claude 앱(웹·Desktop·모바일)이 원격 커스텀 커넥터로 붙는다([ADR-0035](docs/adr/0035-remote-connector.md)). 매일 04:00에 그날 낼 문제를 미리 만들고, 대화나 복습 카드에서 객관식 복습(하루 10문제, 더 풀기 10문제)을 풀면 서버가 채점해 FSRS 일정과 숙련도·약점을 갱신한다. 도구는 아홉 개다.

- `get_learning_context`: 주제와 관련된 개념(상위·선수 개념)과 지난 학습 기록(요약, 헷갈렸던 점)을 돌려준다
- `record_study_note`: 대화에서 이해한 것과 헷갈린 점을 기록하고 다룬 개념에 연결한다
- `list_pending_concepts`, `review_concept`: 대화에서 새로 생긴 개념을 검토한다(승인·병합·거절)
- `get_review_set`, `submit_answer`, `report_question`: 복습 문제를 내고(MCP Apps 복습 카드), 채점하고, 이상한 문제를 신고한다
- `get_weakness`: 트랙별 약점과 근본 원인 후보를 본다
- `update_quiz_guideline`: 출제 지침에 규칙을 더하거나 뺀다

개념 그래프는 회계·업무 도메인 커리큘럼(트랙 8개: 회계 원리와 결산, 채권·채무와 여신, 영업·유통 채널, 구매·재고·물류, 무역·외환, 생산·제조, 기준정보와 내부통제, 산업별 업무)으로 시드한다([ADR-0042](docs/adr/0042-domain-curriculum-reset.md)). Notion 경험 수집(`npm run sync`·`extract`·`abstract`)은 꺼 두었고 코드와 데이터는 남겼다. 진행 상태는 [로드맵](docs/roadmap.md)을 본다.

## 개발

필요한 것: Node.js 24(24.15 이상), Docker, `claude` CLI(로그인된 상태).

```bash
cp .env.example .env      # DB 접속 정보
docker compose up -d      # PostgreSQL
npm ci
npm run check             # 타입 검사, 린트, 형식, 테스트 (DB 테스트는 Testcontainers)
npm run db:migrate && npm run db:seed
npm run build && npm run mcp   # stdio MCP 서버 (보통은 Claude Desktop이 띄운다)
```

명령 전체는 [`CLAUDE.md`](CLAUDE.md), 운영(Mac mini 배포, Claude Desktop 등록)은 [`docs/ops.md`](docs/ops.md)를 본다.

## 문서

- [진행 상태](docs/roadmap.md)
- [설계 문서](docs/specs/2026-10-12-growth-assistant-design.md)
- [아키텍처 (C4)](docs/architecture/)
- [결정 기록 (ADR)](docs/adr/README.md)
- [수동 점검 체크리스트](docs/manual-check.md)
