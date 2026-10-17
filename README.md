# growth-assistant

내 프로젝트·문제 해결 경험(Notion)을 기억하고, 약점 보완과 다음 학습을 이끄는 개인 AI 어시스턴트. 첫 모듈은 Discord 개인 서버에서 동작하는 튜터다. LLM은 Claude 구독(`claude -p` CLI)으로만 호출한다.

**방향 전환:** Discord 대신 PWA + HTTP API로 바꾼다([ADR-0017](docs/adr/0017-pwa-http-api.md)). 아래는 전환 전 Discord 버전 기준이다.

**지금 되는 것 (1단계. NestJS 버전은 실제 Discord 서버 점검 전):** `#튜터` 채널에 질문을 남기면 봇이 스레드를 만들고, 맥락을 유지하며 웹 검색 출처와 함께 튜터링 대화를 한다. `/end` 또는 20분 무응답이면 대화를 요약해 닫는다.

## 개발

필요한 것: Node.js 24, Docker, `claude` CLI(로그인된 상태), Discord 봇(개인 서버에 초대).

```bash
cp .env.example .env      # 봇 토큰, 서버 ID, 내 사용자 ID
docker compose up -d      # PostgreSQL
npm ci
npm run check            # 타입 검사, 린트, 형식, 테스트
npm run dev              # 실행 (변경 감시)
```

운영(Mac mini, launchd)은 [`docs/ops.md`](docs/ops.md)를 본다.

## 문서

- [진행 상태](docs/roadmap.md)
- [설계 문서](docs/specs/2026-10-12-growth-assistant-design.md)
- [아키텍처 (C4)](docs/architecture/)
- [결정 기록 (ADR)](docs/adr/README.md)
