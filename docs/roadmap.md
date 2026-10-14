# 로드맵

상세 작업 계획은 세션 안에서 관리하고, 이 파일에는 진행 상태만 남긴다. 단계별 내용은 [설계 문서 3장](specs/2026-10-12-growth-assistant-design.md)을 따른다.

**현재 위치:** 1.5단계 (NestJS 전환, 브랜치 `migrate/nestjs`)

## 0. 준비
- [x] JDK 21 설치
- [x] Discord 개인 서버 생성
- [x] Discord 채널 5개 (`#복습-퀴즈` `#튜터` `#리포트` `#개념-관리` `#관리`) — 봇이 시작할 때 자동으로 만들기로 결정 (1단계 게이트웨이에서 구현)
- [x] Discord 봇 생성 (토큰 발급, 서버 초대)
- [x] `claude -p` 동작 확인

## 1. MVP — Discord 대화 + Claude 연동
- [x] 프로젝트 골격, Flyway V1
- [x] `ClaudeClient` (CLI 스파이크 포함)
- [x] Discord 게이트웨이
- [x] 튜터링 대화 (`#튜터` 메시지로 자동 스레드, `/end`, 20분 유휴 종료)
- [ ] 운영 (launchd, `docs/ops.md`) — NestJS 전환 후 진행
- [ ] 수동 점검 체크리스트 통과

## 1.5. NestJS 전환 (ADR-0014, ADR-0015)
- [x] 결정 기록 (ADR-0014·0015, 설계 문서 갱신)
- [x] 프로젝트 골격 (NestJS, Vitest, ESLint·Prettier, 환경 변수 검증)
- [x] DB (Drizzle 스키마·baseline 마이그레이션, 저장소)
- [x] `core/llm` (`ClaudeClient`, CLI 클라이언트)
- [x] `core/discord` (게이트웨이, 채널 자동 준비, 응답 분할)
- [x] `tutor/conversation` (튜터링 대화, `/end`, 유휴 종료)
- [x] 운영 스크립트(릴리스 디렉터리 배포, 회전 파일 로그), `CLAUDE.md`·C4 문서·운영 가이드 갱신
- [ ] 수동 점검 체크리스트 통과 후 `main` 병합

## 2. 기억 — Notion·velog 수집, 경험 카드, 개념
- [ ] 개념 그래프 + 시드 개념
- [ ] Notion·velog 수집, 청크 증분 동기화
- [ ] 경험 카드 추출, 승인 정책
- [ ] 대화에 기억 연결

## 3. 퀴즈·복습 — FSRS, 숙련도, 약점
- [ ] FSRS, 숙련도·약점 계산
- [ ] 문제 생성·검증·채점
- [ ] Discord 퀴즈 화면, `/quiz` `/review` `/weakness`

## 4. 먼저 말 걸기 — 예약 작업
- [ ] 스케줄러, 놓친 실행 복구
- [ ] 03:00 동기화·문제 보충, 07:30 아침 복습, 18:30 오늘의 주제, 일 20:00 주간 리포트
- [ ] 알림 피로 규칙, `/settings`
