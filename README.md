# growth-assistant

내 프로젝트·문제 해결 경험(Notion)을 기억하고, 약점 보완과 다음 학습을 이끄는 개인 AI 어시스턴트. 첫 모듈은 튜터(퀴즈·간격 반복·튜터링 대화·먼저 말 걸기)이고, Claude 앱에 붙이는 MCP 서버로 쓴다([ADR-0018](docs/adr/0018-claude-mcp-server.md)). 튜터링 대화는 Claude 앱이 하고, 이 서버는 학습 기록과 개념 그래프를 다루는 도구를 제공한다. LLM은 Claude 구독(Claude 앱, `claude -p` CLI)으로만 쓰고 API 키는 쓰지 않는다.

**지금 되는 것 (1단계):** 맥미니의 Claude Desktop에 로컬(stdio) MCP 서버로 붙는다. 도구는 두 개다.

- `get_learning_context`: 주제와 관련된 개념(상위·선수 개념)과 지난 학습 기록(요약, 헷갈렸던 점)을 돌려준다
- `record_study_note`: 대화에서 이해한 것과 헷갈린 점을 기록하고 다룬 개념에 연결한다

개념 그래프는 앞으로 배울 커리큘럼(트랙 6개: JS/TS, 관계형 DB, 백엔드, IT 인프라, 네트워크, MCP)으로 시드한다([ADR-0022](docs/adr/0022-seed-as-curriculum.md)). 다음은 Notion 수집, 퀴즈·복습이다([로드맵](docs/roadmap.md)).

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
