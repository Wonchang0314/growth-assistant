# 로드맵

상세 작업 계획은 세션 안에서 관리하고, 이 파일에는 진행 상태만 남긴다. 단계별 내용은 [설계 문서 3장](specs/2026-10-12-growth-assistant-design.md)을 따른다.

**현재 위치:** 1단계: 맥미니 Claude Desktop에 로컬 MCP 서버를 붙여 검증한다 (ADR-0018). 첫 작업은 stdio MCP 진입점과 첫 도구

## 0. 준비
- [x] `claude -p` 동작 확인
- [x] 맥미니: Node 24, Docker, `.env`, `npm run check`, 실제 CLI 테스트 통과, Kotlin 시절 DB 볼륨 초기화
- [ ] 맥미니 잠자기 방지 설정

## 지난 경과
- Kotlin + Spring Boot로 Discord 튜터링 대화까지 구현(커밋 `a7bc8c5`) → NestJS로 전환(ADR-0014·0015, PR #1)
- 인터페이스: Discord → PWA(ADR-0017) → Claude 앱 + MCP 서버, 로컬 우선(ADR-0018). Discord 실제 점검과 PWA 구현은 하지 않았다
- `ClaudeClient`(CLI 클라이언트)는 백그라운드 작업용으로 그대로 쓴다

## 1. MVP: 로컬 MCP 서버 (ADR-0018)
- [x] `ClaudeClient` (백그라운드 LLM 작업용)
- [ ] stdio MCP 진입점 (`mcp-stdio.ts`), `core/mcp` 도구 등록·처리기 탐색, 파일 로그
- [ ] 첫 도구 (`get_learning_context`, `record_study_note`, `study_note` 테이블)
- [ ] 튜터 지침 (MCP `instructions`, Claude 프로젝트 지침 초안)
- [ ] Claude Desktop 등록 (릴리스 디렉터리 배포, 설정 예시를 `docs/ops.md`에)
- [ ] 검증: Cowork 예약 작업이 로컬 MCP 도구를 부르는지, 결과를 휴대폰에서 볼 수 있는지 (안 되면 Claude Code 데스크톱 예약 작업)
- [ ] Discord 코드·설정과 대화 세션 테이블 제거, `ops/` 정리
- [ ] 수동 점검 체크리스트 (Desktop 대화에서 도구 호출, 학습 기록, 예약 작업)

## 2. 기억: Notion·velog 수집, 경험 카드, 개념
- [ ] 개념 그래프 + 시드 개념
- [ ] Notion·velog 수집, 청크 증분 동기화 (`sync_now`, `sync_status`)
- [ ] 경험 카드 추출, 승인 정책 (`list_pending_concepts`, `review_concept`)
- [ ] 대화에 기억 연결 (`search_experience`, `get_learning_context` 확장)

## 3. 퀴즈·복습: FSRS, 숙련도, 약점
- [ ] FSRS, 숙련도·약점 계산
- [ ] 문제 생성·검증, 출제 지침 (`update_quiz_guideline`)
- [ ] 복습·채점 도구 (`get_review_set`, `submit_answer`, `report_question`, `get_weakness`)
- [ ] 퀴즈 품질 점검 (평가 세트, 실제 사용)

## 4. 먼저 말 걸기: 예약 작업
- [ ] 상시 실행 진입점(launchd), 서버 스케줄러, 놓친 실행 복구
- [ ] 03:00 동기화·문제 보충
- [ ] 07:30 아침 복습, 18:30 오늘의 주제, 일 20:00 주간 리포트 (`get_daily_topic`, `get_weekly_report`, Claude 예약 작업)
- [ ] 무시 누적 감지, 주간 리포트 조정 권고

## 5. 원격 전환: 모바일·아이패드 (새 ADR)
- [ ] 결정: 공개 경로(Funnel·Cloudflare Tunnel), 인증(OAuth·고정 헤더), IP 제한, 알림(예약 작업 푸시·ntfy), MCP Apps
- [ ] Streamable HTTP 진입점, 인증, 커스텀 커넥터 등록
- [ ] 알림, 운영 감시
- [ ] 모바일·아이패드 수동 점검
