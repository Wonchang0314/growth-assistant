# 로드맵

상세 작업 계획은 세션 안에서 관리하고, 이 파일에는 진행 상태만 남긴다. 단계별 내용은 [설계 문서 3장](specs/2026-10-12-growth-assistant-design.md)을 따른다.

**현재 위치:** 3단계 남은 기능(학습 맥락에 숙련도·근본 원인, quiz 레이어 평가) → 4단계 원격 전환 → 5단계 예약 작업으로 프로토타입을 먼저 만들고, 퀴즈 품질은 6단계에서 실제로 쓰면서 올린다(ADR-0034, 2026-10-19). 3단계 기능(FSRS·숙련도, 객관식 출제·검증, 복습·채점·신고, 약점, 변형, 상황 판단형)은 2026-10-18에 만들고 출제 정책을 한 번 조정했다(ADR-0033). 다음 할 일 순서는 `docs/handoff.md`. 이전 경과: 1단계(맥미니 Claude Desktop에 로컬 MCP 서버를 붙여 검증, ADR-0018)는 2026-10-17에 닫았다. 2단계에서 Notion 문서 164개를 수집해 경험 카드 545장을 뽑고, 새 개념 81개를 검토하고, 대화에 경험 카드를 이었고(2026-10-18), 판단 사례 279개를 만들었다(경험 사례와 가정 사례, ADR-0021·0024·0026). 트랙은 JS/TS·관계형 DB·백엔드·IT 인프라·네트워크·MCP다(ADR-0022·0025).

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
- [x] 경험 카드 추출, 백필 승인 정책 (`npm run extract`, `experience`·`experience_concept`)
- [x] 개념 승인 도구 (`list_pending_concepts`, `review_concept`)
- [x] 백필 개념 검토 (81개 → 승인 64, 거절 12, 병합 5, 2026-10-18)
- [x] `review_concept` 상위 개념 지우기 버그 수정 (`removeParent`)
- [x] 결정: 수집 경험의 프런트엔드·GIS 개념 포함 (ADR-0025), 시드에 CI/CD 파이프라인·배포 전략·리눅스 서버 운영 상위 개념
- [x] 운영 수집 개념 10개에 상위 개념 지정 (배포 뒤 `review_concept`, 2026-10-18)
- [x] 결정: 회사 용어 목록 없이 패턴 게이트와 독립 검증으로 거름 (ADR-0024)
- [x] 판단 사례 추상화 파이프라인: 선별, 치환, 패턴 게이트, 독립 검증(Opus), `npm run abstract` (ADR-0021·0024, 10장 시험 2026-10-18)
- [x] 판단 사례 프롬프트 개선(10장 ACTIVE 2→5)과 검토 도구 (`list_pending_cases`, `review_case`)
- [x] 결정: 판단 사례를 경험 사례와 가정 사례로 나누고 자동 폴백 (ADR-0026)
- [x] 가정 사례 자동 폴백 구현, PENDING 7장 다시 시험 (7장 모두 ACTIVE, 2026-10-18)
- [x] 보기 길이 게이트, `claude -p` 동시 실행 5개 (ADR-0027)
- [x] 판단 사례 전체 실행 (2026-10-18, 279개: ACTIVE 271·PENDING 8)
- [x] 대화에 기억 연결 (`search_experience`, `get_learning_context`에 경험 카드)
- 2단계 완료 확인(경험 카드 인용)과 판단 사례 PENDING 검토는 6단계로 옮겼다(ADR-0034)

## 3. 퀴즈·복습: 객관식·빈칸, FSRS, 숙련도, 약점 (ADR-0019)
- [ ] `quiz` 모듈 레이어 폴더 구조 시도, 3단계 끝에 평가 (ADR-0020)
- [x] FSRS, 숙련도·약점 계산 (`concept_mastery`, 단기 학습 단계 끔, 최대 간격 180일, 학습 기록 개념을 복습 일정에, ADR-0028)
- [x] 개념 병합 때 학습 기록·숙련도 옮기기 (병합 참여 포트, ADR-0028)
- [ ] 학습 맥락에 숙련도·약한 선수 개념, 근본 원인 추적
- [x] 객관식·빈칸 문제 생성·검증 (약점 반영 출제, 오답 보기 오개념), 출제 지침 (`update_quiz_guideline`), `npm run quiz` (ADR-0029)
- [x] 첫 출제 시험과 정책 조정 (`npm run quiz` 3~4개념, 웹 검색, 근본 원인 둘 이상, 상황 판단형 2:1, 빈칸 제외, ADR-0033)
- [x] 상황 판단형 객관식 (`angle = SCENARIO`, 판단 사례에서 출제, 개념 문제 2 : 상황 판단형 1, ADR-0021·0032·0033)
- [x] 변형 문제 (`key_point`, `variant_of`, 흔들린 문제 우선, 원래 문제와 비교 검증)
- [x] 복습·채점 도구 (`get_review_set`, `submit_answer`, `report_question`, 없는 문제는 뒤에서 생성, ADR-0030)
- [x] `get_weakness` (트랙별 약점, 근본 원인 후보, 미측정 수, 근본 원인(약점 둘 이상이 기댈 때)을 출제 맨 앞에, ADR-0031·0033)
- 실제 출제 품질 확인·퀴즈 품질 점검은 6단계로 옮겼다(ADR-0034)

## 4. 원격 전환: 모바일·아이패드 (프로토타입 1, 새 ADR)
- [ ] 결정: 공개 경로(Funnel·Cloudflare Tunnel), 인증(OAuth·고정 헤더), IP 제한, 알림(예약 작업 푸시·ntfy), MCP Apps (사용자 인터뷰)
- [ ] Streamable HTTP 진입점, 인증, 커스텀 커넥터 등록
- [ ] 상시 실행 진입점(launchd, `ops/install.sh`). 원격 서버와 5단계 예약 작업이 함께 쓴다
- [ ] 운영 감시(죽으면 다시 띄우기, 로그)
- [ ] 모바일·아이패드 수동 점검

## 5. 예약 작업: 먼저 말 걸기 (프로토타입 2)
- [ ] 결정: 예약 작업 실행 방식 (서버 스케줄러, 원격 전환 뒤 Claude 예약 작업, 알림 경로) (사용자 인터뷰)
- [ ] 서버 스케줄러, 놓친 실행 복구
- [ ] 새벽 동기화·문제 보충 (Notion 증분 동기화·경험 카드 추출, 오늘 복습할 개념의 문제 미리 만들기)
- [ ] 아침 복습 알림
- [ ] 프로토타입 확인: 모바일에서 아침 알림을 받고 복습을 풀어 채점 기록이 쌓임

## 6. 실사용 품질 올리기 (ADR-0034)
- [ ] 퀴즈 품질 확인·점검 (실제 출제 품질, 평가 세트, 출제 지침 다듬기, `docs/manual-check.md` 3단계)
- [ ] 남은 열린 질문: 변형 "번갈아" 비율, 객관식 보기 4개 고정, 빈칸 다시 넣기 (ADR-0033)
- [ ] 2단계 완료 확인: 대화에서 Claude가 경험 카드를 인용 (`docs/manual-check.md` 2단계)
- [ ] 판단 사례 PENDING 8장 검토 (`docs/manual-check.md` 2단계 "판단 사례 검토")
- [ ] 저녁 오늘의 주제, 일요일 주간 리포트 (`get_daily_topic`, `get_weekly_report`)
- [ ] 무시 누적 감지, 주간 리포트 조정 권고
- [ ] 숙련도 이력과 `get_weakness`의 지난주 대비 변화 (ADR-0031)
- [ ] MCP Apps 퀴즈 화면 (4단계 결정에 따라)
