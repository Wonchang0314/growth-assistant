# 로드맵

상세 작업 계획은 세션 안에서 관리하고, 이 파일에는 진행 상태만 남긴다. 단계별 내용은 [설계 문서 3장](specs/2026-10-12-growth-assistant-design.md)을 따른다.

**현재 위치:** 2단계: Notion 수집, 경험 카드, 개념. 1단계(맥미니 Claude Desktop에 로컬 MCP 서버를 붙여 검증, ADR-0018)는 2026-10-17 체크리스트 확인으로 닫았다. 핵심 학습 기능을 먼저 만들고 먼저 말 걸기는 4단계로 미뤘다 (ADR-0019). 1단계에서 stdio 진입점, 첫 도구, 튜터 지침, Desktop 등록 절차(`ops/desktop-config.sh`)와 수동 점검 체크리스트를 만들고 Discord 코드를 지웠다. 그사이 2단계 준비를 시작했다. Notion 복습 문서에서 시드 개념 후보를 뽑았고, 트랙에 IT 인프라를 더했으며, 업무 경험을 판단 사례로 추상화해 출제하기로 정했다(ADR-0021). 개념 그래프를 만들어 학습 맥락·학습 기록에 연결했다. Desktop에서 써 본 뒤 시드를 앞으로 배울 커리큘럼으로 바꾸고 트랙을 JS/TS·관계형 DB·백엔드·IT 인프라·네트워크·MCP로 다시 짰다(ADR-0022, 193개). 기억의 원천은 Notion 하나로 정했다(ADR-0023). Notion 원문·청크 수집을 끝냈고, 판단 사례는 회사 용어 목록 없이 거르기로 했다(ADR-0024). 다음은 경험 카드 추출

## 0. 준비
- [x] `claude -p` 동작 확인
- [x] 맥미니: Node 24, Docker, `.env`, `npm run check`, 실제 CLI 테스트 통과, Kotlin 시절 DB 볼륨 초기화
- [x] 맥미니 잠자기 방지 설정 (`docs/ops.md`)

## 지난 경과
- Kotlin + Spring Boot로 Discord 튜터링 대화까지 구현(커밋 `a7bc8c5`) → NestJS로 전환(ADR-0014·0015, PR #1)
- 인터페이스: Discord → PWA(ADR-0017) → Claude 앱 + MCP 서버, 로컬 우선(ADR-0018). Discord 실제 점검과 PWA 구현은 하지 않았다
- Cowork 예약 작업이 로컬 MCP를 못 써서 먼저 말 걸기를 4단계로 미루고, 퀴즈는 객관식·빈칸부터 만든다(ADR-0019)
- `ClaudeClient`(CLI 클라이언트)는 백그라운드 작업용으로 그대로 쓴다

## 1. MVP: 로컬 MCP 서버 (ADR-0018)
- [x] `ClaudeClient` (백그라운드 LLM 작업용)
- [x] stdio MCP 진입점 (`mcp-stdio.ts`), `core/mcp` 도구 등록·처리기 탐색, 파일 로그, `npm run db:migrate`
- [x] 첫 도구 (`get_learning_context`, `record_study_note`, `study_note` 테이블)
- [x] 튜터 지침 (MCP `instructions`, Claude 프로젝트 지침 초안 `docs/claude-project-instructions.md`)
- [x] Claude Desktop 등록 절차 (릴리스 디렉터리 배포, `ops/desktop-config.sh`, `docs/ops.md`)
- [x] 맥미니 Desktop에 실제 등록
- [x] Discord 코드·설정과 대화 세션 테이블 제거, `ops/` 정리 (상시 실행 앱은 4단계에서 다시 만든다)
- [x] 수동 점검 체크리스트 작성 (`docs/manual-check.md`)
- [x] 1단계 체크리스트 확인 (Desktop 대화에서 도구 호출, 학습 기록, 2026-10-17)

## 2. 기억: Notion 수집, 경험 카드, 개념
- [x] 시드 개념 후보 추출 (Notion 복습 문서, `docs/research/2026-10-16-seed-concept-candidates.md`)
- [x] 결정: 트랙 5개와 가중치, 판단 사례 추상화와 상황 판단형 출제 (ADR-0021)
- [x] 시드 개념 YAML (256개, 사용자 검토, `src/core/knowledge/seed/`)
- [x] 시드를 커리큘럼으로 교체: 트랙 6개, 193개, 시드에서 빠진 개념은 적재 때 지움 (ADR-0022)
- [x] 개념 그래프: `track`·`concept`·`concept_edge`, 이름·별칭 매칭, 선수 체인(재귀 CTE), 시드 적재(`npm run db:seed`, 배포 때 실행)
- [x] 학습 기록에 개념 연결(`study_note_concept`), `get_learning_context`에 관련 개념·상위·선수 개념
- [x] 결정: 기억의 원천은 Notion 하나 (ADR-0023)
- [x] Notion 수집 범위 결정, 원문·청크 증분 동기화 (`npm run sync`, `sync_status`)
- [ ] `sync_now` (4단계 상시 실행 진입점과 함께)
- [ ] 경험 카드 추출, 승인 정책 (`list_pending_concepts`, `review_concept`)
- [x] 결정: 회사 용어 목록 없이 패턴 게이트와 독립 검증으로 거름 (ADR-0024)
- [ ] 판단 사례 추상화: 치환, 패턴 게이트, 독립 검증(Opus), 검토 도구 (`list_pending_cases`, `review_case`, ADR-0021·0024)
- [ ] 대화에 기억 연결 (`search_experience`, `get_learning_context` 확장)

## 3. 퀴즈·복습: 객관식·빈칸, FSRS, 숙련도, 약점 (ADR-0019)
- [ ] `quiz` 모듈 레이어 폴더 구조 시도, 3단계 끝에 평가 (ADR-0020)
- [ ] FSRS, 숙련도·약점 계산
- [ ] 객관식·빈칸 문제 생성·검증 (약점 반영 출제, 오답 보기 오개념), 출제 지침 (`update_quiz_guideline`)
- [ ] 상황 판단형 객관식 (`angle = SCENARIO`, 판단 사례에서 출제, ADR-0021)
- [ ] 변형 문제 (`key_point`, `variant_of`)
- [ ] 복습·채점 도구 (`get_review_set`, `submit_answer`, `report_question`, `get_weakness`)
- [ ] 퀴즈 품질 점검 (평가 세트, 실제 사용)

## 4. 먼저 말 걸기: 예약 작업 (ADR-0019로 미룸)
- [ ] 결정: 예약 작업 실행 방식 (Claude Code 데스크톱 예약 작업, 원격 전환 뒤 예약 작업). 1~3단계 검증 뒤
- [ ] 상시 실행 진입점(launchd, `ops/install.sh`), 서버 스케줄러, 놓친 실행 복구
- [ ] 03:00 동기화·문제 보충
- [ ] 07:30 아침 복습, 18:30 오늘의 주제, 일 20:00 주간 리포트 (`get_daily_topic`, `get_weekly_report`)
- [ ] 무시 누적 감지, 주간 리포트 조정 권고

## 5. 원격 전환: 모바일·아이패드 (새 ADR)
- [ ] 결정: 공개 경로(Funnel·Cloudflare Tunnel), 인증(OAuth·고정 헤더), IP 제한, 알림(예약 작업 푸시·ntfy), MCP Apps
- [ ] Streamable HTTP 진입점, 인증, 커스텀 커넥터 등록
- [ ] 알림, 운영 감시
- [ ] 모바일·아이패드 수동 점검
