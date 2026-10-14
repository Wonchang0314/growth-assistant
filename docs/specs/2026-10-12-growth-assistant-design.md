# growth-assistant 설계 문서

- 작성일: 2026-10-12
- 상태: 설계 확정 (구현 전)
- 이번 범위: `core` + `tutor` 모듈 (커리어·Canva 연동은 후속 프로젝트)

---

## 1. 목적

내가 해온 프로젝트와 문제 해결 경험을 기억하고, 그 기억과 웹 검색·모델 지식을 결합해
**약점을 보완하고 다음에 배울 것을 제시하며 지속적으로 대화하는 개인 AI 어시스턴트**를 만든다.
첫 번째 역할은 튜터다.

### 학습 목표 (우선순위 순)

| 순위 | 트랙 | 내용 | 초기 가중치 |
|---|---|---|---|
| 1 | 취업·면접 | 기술 면접 대비, 내 프로젝트 경험을 깊이 있게 설명하는 연습 | 0.4 |
| 2 | CS 기초 | 네트워크, OS, DB, 자료구조·알고리즘 | 0.3 |
| 3 | 백엔드 | Node.js·NestJS, TypeScript, DB 이해도 심화 | 0.2 |
| 4 | 프론트 심화 | 현재 사용 중인 프론트엔드 스택 심화 | 0.1 |

장기 방향: 프론트엔드와 백엔드를 아우르는 풀스택 개발자.

### 성공 기준

- 매일 아침 복습과 저녁 주제를 받아 Discord에서 학습을 이어갈 수 있다.
- 튜터가 대화와 문제에서 내 실제 경험(Notion·velog)을 근거로 연결한다.
- 개념별 숙련도와 약점이 객관적인 풀이 기록으로 추적되고, 주간 리포트로 변화가 보인다.
- 모든 LLM 호출이 Claude 구독(`claude` CLI)으로 동작한다. API 키를 사용하지 않는다.

---

## 2. 확정된 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 프로젝트 형태 | 별도 레포의 신규 프로젝트 (`JSL107/personal_agents`는 구조 참고용) | 사용자 결정 |
| 언어·프레임워크 | TypeScript + NestJS (ADR-0014, Kotlin + Spring Boot에서 전환) | 아는 언어로 백엔드 개념에 집중, 프로젝트 자체가 학습 겸 포트폴리오 |
| 인터페이스 | Discord 봇 (discord.js), **개인 서버** | 버튼·모달·스레드 지원, 먼저 말 걸기 가능 |
| 실행 환경 | 사용자의 Mac에서 상시 실행 (launchd), Mac을 호스트로 사용 | 사용자 결정 |
| LLM | `claude -p` 서브프로세스 (구독 로그인 사용) | 구독 기반 사용 |
| 저장소 | PostgreSQL 16 단일 저장소 (Docker) | 소규모 그래프는 재귀 CTE로 충분, 정합성 단순 |
| 그래프 DB | 사용하지 않음. `ConceptGraphRepository` 인터페이스로 추상화 | 필요 시 Apache AGE·Neo4j로 교체 가능 |
| 임베딩 | 초기에는 사용하지 않음. 통제 어휘 개념 태그 + 그래프 이웃으로 검색 | 나중에 pgvector로 하이브리드 확장 |
| 기억 출처 | Notion, velog (GitHub 제외) | GitHub에는 일부·오래된 프로젝트만 있고, 사내 레포는 사용 불가 |
| 기억 수집 | 1회 백필 → 이후 청크 단위 증분 동기화. 런타임에는 DB만 조회 | 사용량 절감 |
| 간격 반복 | **FSRS** (`ts-fsrs` 라이브러리, 기본 파라미터로 시작, ADR-0016) | SM-2보다 예측 정확도가 높음. 공식 TS 구현, MIT |
| 복습 단위 | 개념 (복습할 때마다 같은 개념의 다른 문제) | 문제 암기 방지 |
| 하루 복습 상한 | 최대 10문제 | 리뷰 부채 누적 방지 |
| 이름 | `growth-assistant` (튜터는 그 안의 첫 모듈) | 이력서·포트폴리오 역할로 확장 예정 |

---

## 3. 단계별 로드맵

| 단계 | 내용 | 완료 조건 |
|---|---|---|
| **1. MVP** | Discord 봇 골격, `ClaudeCliClient`, 스레드 기반 대화, 웹 검색 | `#튜터`에서 스레드 대화가 맥락을 유지하며 동작 |
| **2. 기억** | Notion·velog 수집, 경험 카드·개념 추출, 시드 개념, 승인 정책 | 백필 완료, 대화에서 관련 경험 카드를 인용 |
| **3. 퀴즈·복습** | 출제·검증·채점, FSRS, 숙련도·약점 지도 | `/quiz`, `/review`, `/weakness` 동작 |
| **4. 먼저 말 걸기** | 아침 복습, 저녁 주제, 주간 리포트, 정기 동기화·문제 풀 보충 | 예약된 시각에 알림, 놓친 실행 복구 |

---

## 4. 아키텍처

Mac에서 실행하는 **NestJS 애플리케이션 하나**(모듈러 모놀리스)와 Docker로 띄우는 **PostgreSQL 16**으로 구성한다.

```
Discord ⇄ [discord] 슬래시 명령·버튼·모달·스레드 (discord.js)
             │
             ▼
   ┌──────────────── core ────────────────┐
   │ memory       경험 카드, 원문 문서·청크   │
   │ knowledge    개념 그래프, 트랙           │
   │ ingestion    Notion·velog 수집, 증분 동기화│
   │ llm          ClaudeCliClient           │
   │ scheduler    예약 작업, 놓친 실행 복구    │
   ├──────────────── tutor ───────────────┤
   │ conversation 튜터링 대화, 세션 요약       │
   │ quiz         출제, 검증, 채점            │
   │ mastery      FSRS, 숙련도, 약점 지도     │
   │ outreach     아침 복습, 저녁 주제, 주간 리포트│
   └──────────────────────────────────────┘
             │                     │
             ▼                     ▼
      claude -p 서브프로세스      PostgreSQL (Drizzle + SQL)
```

### 원칙

- 모든 상태는 PostgreSQL에 둔다. Claude는 상태가 없고, 호출마다 필요한 맥락만 받는다.
- **계산은 코드로, 생성과 대화는 LLM으로.** 스케줄링, 숙련도, 약점 점수는 코드가 결정적으로 계산한다. Claude는 추출, 출제, 서술형 채점, 오개념 태깅, 대화만 맡는다.
- `claude -p` 호출은 반드시 `ClaudeClient` 인터페이스(구현: `ClaudeCliClient`)를 거친다.
- Discord 핸들러는 discord.js 객체를 유스케이스에 넘기지 않는다. 유스케이스는 Discord 없이 테스트할 수 있어야 한다.
- 향후 `career` 모듈(이력서·포트폴리오, Canva 연동)이 `core`의 기억을 공유할 수 있도록 모듈을 `core` / `tutor`로 분리한다 (ADR-0015).

### 모듈 구조 (초안)

```
src/
├── core
│   ├── discord      # discord.js 클라이언트, 이벤트 라우팅, 컴포넌트 ID 규칙
│   ├── llm          # ClaudeClient, ClaudeCliClient, 프롬프트 템플릿, 호출 로그
│   ├── memory       # SourceDocument, DocumentChunk, Experience
│   ├── knowledge    # Track, Concept, ConceptEdge, ConceptGraphRepository
│   ├── ingestion    # Source 인터페이스, NotionSource, VelogSource, 동기화 서비스
│   └── scheduler    # 예약 작업, 실행 기록, 놓친 실행 복구
└── tutor
    ├── conversation
    ├── quiz
    ├── mastery
    └── outreach
```

---

## 5. 데이터 모델

단일 사용자 시스템이므로 `user` 테이블은 두지 않는다. 마이그레이션은 drizzle-kit이 만든 SQL 파일로 관리한다.

### 5.1 Knowledge: 개념 그래프와 트랙

```
track          id, name, weight
concept        id, track_id, name UNIQUE, aliases text[], description,
               status (ACTIVE | PROPOSED | REJECTED),
               origin (SEED | INGESTION | CONVERSATION),
               auto_approved boolean, created_at
concept_edge   from_id, to_id, type (PREREQUISITE | PART_OF | RELATED)
               PK (from_id, to_id, type)
```

- 선수 지식 체인과 근본 원인 탐색은 `WITH RECURSIVE` 쿼리로 조회한다.

### 5.2 Memory: 원문, 청크, 경험 카드

```
source_document     id, source (NOTION | VELOG), external_id, title, url,
                    summary, content_hash, source_updated_at, synced_at,
                    extraction_status (PENDING | DONE | FAILED), last_error
                    UNIQUE (source, external_id)
document_chunk      id, document_id, seq, chunk_hash, content
                    (Notion: 블록 단위, velog: 문단 단위.
                     나중에 임베딩 컬럼을 추가할 단위)
experience          id, document_id NULL, origin (DOCUMENT | CONVERSATION),
                    project_name, title,
                    situation, task, action, result, lesson,   -- STAR+L 형식
                    occurred_at, created_at, updated_at
experience_concept  experience_id, concept_id
sync_cursor         source PK, last_synced_at
```

### 5.3 Mastery: FSRS와 숙련도

```
concept_mastery   concept_id PK,
                  -- FSRS 상태
                  stability, difficulty, state (NEW | LEARNING | REVIEW | RELEARNING),
                  reps, lapses, last_review_at, due_at,
                  -- 숙련도·약점 (힌트 없이 낸 응답만 반영)
                  mastery_score (0.0~1.0), weakness_score (0.0~1.0),
                  graded_attempts, updated_at
```

### 5.4 Quiz: 문제와 풀이

```
quiz_question   id, concept_id,
                type (MULTIPLE_CHOICE | FILL_BLANK | SHORT_ANSWER),
                angle (WHY | WHEN | TRADEOFF | MY_PROJECT | MECHANISM),
                difficulty (1~3), prompt, choices jsonb, answer,
                accepted_answers text[], explanation, reference_material,
                experience_id NULL,
                validation_status (PENDING | VALID | INVALID), reported boolean,
                used_count, created_at
quiz_attempt    id, question_id, user_answer, is_correct, score,
                confidence (SURE | UNSURE | GUESS),
                hint_used boolean, feedback, misconception,
                response_time_ms, answered_at
```

### 5.5 Conversation과 운영

```
conversation_session  id, discord_thread_id UNIQUE, topic, status (ACTIVE | CLOSED),
                      summary, summarized_message_id, answer_revealed boolean, started_at, closed_at
conversation_message  id, session_id, role (USER | TUTOR), content, created_at
session_concept       session_id, concept_id, signal (DISCUSSED | CONFUSED)
outreach_log          id, type (MORNING_REVIEW | DAILY_TOPIC | WEEKLY_REPORT),
                      scheduled_for, discord_message_id, sent_at, engaged_at,
                      payload jsonb
llm_call_log          id, purpose, model, duration_ms, success,
                      input_chars, output_chars, error, created_at
app_setting           key PK, value
```

### 5.6 관계 요약

```
track 1─N concept ─N:M─ concept (concept_edge)
concept 1─1 concept_mastery
concept 1─N quiz_question 1─N quiz_attempt
concept N:M experience (experience_concept)
source_document 1─N document_chunk
source_document 1─N experience
conversation_session 1─N conversation_message
```

---

## 6. 개념 어휘와 승인 정책

개념은 **통제 어휘**로 관리한다. 같은 개념이 여러 이름으로 흩어지지 않도록, Claude에게 항상 기존 개념 목록을 주고 "목록에서 먼저 고르고, 없을 때만 새 개념을 제안하라"고 지시한다.

| 단계 | 승인 방식 |
|---|---|
| 초기 시드 (트랙별 100~200개 + 관계) | Claude가 초안을 YAML로 생성하고, 사용자가 1회 검토 |
| 일회성 백필 | **조건부 자동 승인.** 기존 개념의 `PART_OF` 하위이면서 확신이 높으면 자동으로 `ACTIVE` 처리하고, 애매한 것은 Discord `#개념-관리`에서 묻는다 |
| 정기 증분 동기화 | **자동 승인** + 안전장치 |
| 대화에서 나온 개념 | 증분 동기화와 같은 정책 |

### 자동 승인의 안전장치

1. **중복 검사 먼저:** 이름이나 별칭이 같거나 거의 같은 개념이 있으면, 새로 만들지 않고 기존 개념의 별칭으로 병합한다.
2. **사후 확인:** 그 주에 자동으로 추가·병합된 개념을 주간 리포트에 `[되돌리기]`·`[병합]` 버튼과 함께 표시한다. 무시하면 확정된다.

### 승인 대기 중 동작

- 경험 카드는 `PROPOSED` 상태의 개념에도 즉시 연결한다.
- `PROPOSED` 개념은 숙련도 추적과 출제 대상에서 제외한다.
- 병합하면 연결이 기존 개념으로 옮겨진다.

---

## 7. 핵심 흐름

### 7.0 `ClaudeCliClient`

```
claude -p --output-format stream-json --verbose --model <용도별 설정>
       --setting-sources "" --strict-mcp-config --no-session-persistence
       --tools "" (대화·주제 탐색만 --tools "WebSearch,WebFetch" --allowedTools 같은 값)
       [--system-prompt <프롬프트>] [--json-schema <스키마>]
```

- 프롬프트는 표준입력으로 전달한다. 출력은 줄마다 JSON 이벤트 하나이며, 끝까지 읽은 뒤 `result` 이벤트와 마지막 `rate_limit_event`만 해석한다 (ADR-0012).
- 성공 여부는 `is_error`로 판단한다(`subtype`은 오류여도 `"success"`일 수 있다). 미로그인은 `result` 문자열(`Not logged in`)로, 한도 초과는 `rate_limit_event`의 상태와 `resetsAt`으로 판별한다.
- 구조화된 출력은 `--json-schema`로 받아 `structured_output`을 zod 스키마로 다시 검증한다. `--json-schema`에 넘기는 JSON Schema도 같은 zod 스키마에서 만든다. 튜터 대화는 `{reply, sources}` 스키마로 웹 출처를 받는다.
- 빈 전용 작업 디렉터리에서 실행한다. 이 디렉터리와 상위 디렉터리에 CLAUDE.md가 없어야 한다. `--setting-sources ""`가 CLAUDE.md 로드를 막는 것은 스파이크로 확인했다.
- 실행 파일 경로는 설정값으로 받는다 (OS마다 다를 수 있다). `--bare`는 구독 로그인을 읽지 않아 쓰지 않는다.
- 도구는 기본적으로 끈다. 대화와 주제 탐색 호출에만 `WebSearch`, `WebFetch`를 허용한다.
- 동시 실행은 최대 2개(세마포어). 용도별 타임아웃을 두고, 타임아웃이 나면 1회 재시도한다.
- JSON 형식이 깨지면 오류 내용을 붙여 1회 재요청한다.
- 모든 호출을 `llm_call_log`에 기록한다.
- 용도별 모델은 설정 파일에서 지정한다 (예: 추출·출제는 Opus, 대화·채점은 Sonnet).

### 7.1 수집 (백필, 증분 동기화)

```
트리거: 최초 백필, /sync 명령, 매일 03:00

1. 소스별로 변경된 문서를 조회한다 (sync_cursor 이후 수정된 Notion 페이지, velog 글)
2. 청크로 나눈다 (Notion: 블록, velog: 문단) → 청크 해시를 비교해 추가·수정·삭제된 청크를 찾는다
3. 바뀐 청크가 없으면 건너뛴다
4. Claude 추출 호출
   - 입력: 바뀐 청크 + 문서 요약 + 이 문서에서 이미 뽑은 경험 카드 + 개념 목록
   - 출력: 경험 카드 추가·수정안, 개념 매핑, 새 개념 제안, 갱신된 문서 요약
5. 하나의 트랜잭션으로 반영하고 승인 정책을 적용한다
6. 실패한 문서는 FAILED로 표시하고, 다음 실행 때 재시도한다 (다른 문서 처리는 계속)
```

- Notion API 호출 속도는 초당 약 3회로 제한한다.
- velog는 비공식 GraphQL API를 쓰므로, 어댑터를 분리하고 수집이 실패하면 `#관리` 채널에 알린다.

### 7.2 튜터링 대화

```
시작: #튜터 채널에 메시지를 쓴다 (슬래시 명령 없음), 저녁 알림의 [이야기하기] 버튼, 퀴즈 결과의 [더 물어보기] 버튼
     → 그 메시지로 #튜터 채널에 스레드를 만든다 (스레드 하나 = conversation_session 하나)
     → 시작 메시지가 첫 질문이 되고, 이후 대화는 스레드 안에서 한다
     → 이미 종료된 세션의 스레드에 쓰면 #튜터에 새 메시지로 시작하라고 안내한다

메시지마다:
 1. 즉시 지연 응답("생각 중…")을 보낸다
 2. 맥락을 조립한다
    - 세션 요약 + 요약되지 않은 최근 메시지 (8~15개)
      · 응답 뒤 요약되지 않은 메시지가 16개 이상이면 최근 8개만 남기고 나머지를 요약에 합친다
        (summarized_message_id까지 합쳤다고 기록)
    - 관련 개념 (먼저 별칭 매칭, 애매하면 Claude가 판단)
    - 그 개념의 숙련도, 약한 선수 개념, 관련 경험 카드
 3. Claude를 호출한다 (웹 검색 허용, 교수 규칙 적용 — 7.5 참고)
 4. 응답으로 메시지를 수정하고 DB에 저장한다

종료: 스레드에서 /end 명령 또는 20분 무응답
 → 세션 요약 생성, 새 경험 카드·개념 추출 (자동 승인)
 → 혼란을 보인 개념은 session_concept.signal = CONFUSED로 기록 (출제 우선순위만 올리고 점수는 바꾸지 않음)
 → "확인 문제 2개 풀어볼래요?" 버튼 제공
```

- 대화 결과로는 숙련도 점수를 바꾸지 않는다. 숙련도는 퀴즈 결과로만 갱신한다.

### 7.3 퀴즈와 복습

```
시작: /quiz [주제], /review, 아침 복습 알림

1. 개념 선택 우선순위
   ① due_at ≤ 지금인 개념 (전날 저녁 주제 개념은 반드시 포함)
   ② 약점 개념, CONFUSED 신호가 있는 개념
   ③ 트랙 가중치에 따른 새 개념
   하루 최대 10문제. 넘치면 우선순위가 높은 것만 낸다
2. 문제 풀에서 VALID이면서 아직 안 쓴 문제를 꺼낸다 (없으면 즉석 생성 + 검증)
3. 출제
   - 객관식: [A][B][C][D] 버튼
   - 빈칸·서술형: [답하기] 버튼 → 모달 입력창
4. 답한 직후 확신도 버튼: [확실] [애매] [찍음]
5. 채점
   - 객관식: 정답과 비교
   - 빈칸: answer와 accepted_answers로 비교 (공백·대소문자 정규화)
   - 서술형: Claude가 점수·피드백·오개념을 진단 (기준 자료를 함께 제공)
6. 결과: 정오, 해설, 관련 경험 카드, [더 물어보기], [문제 오류 신고]
7. 갱신: FSRS 상태, 숙련도·약점 점수 (8장 규칙)
```

**문제 생성 규칙**

- 출제 각도는 "왜 / 언제 쓰나 / 트레이드오프 / 동작 원리 / 내 프로젝트에서는"을 우선한다. "용어 ↔ 정의" 형태는 피한다.
- 같은 개념을 복습할 때마다 다른 문제(바꿔 묻기)를 낸다.
- 출제할 때 기준 자료(정답 근거, 해설, 출처: 경험 카드나 웹 자료)를 함께 넣고, `reference_material`에 저장한다.
- 객관식 오답 보기는 가능하면 경험 카드에 기록된 내 실제 실수와 오개념에서 만든다.

**검증 단계**

- 문제를 생성한 직후 별도 Claude 호출로 세 가지를 확인한다: 정답이 하나뿐인지, 정답이 보기 안에 있는지, 기준 자료만으로 풀 수 있는지.
- 통과한 문제만 `VALID`가 된다.
- `[문제 오류 신고]`를 누르면 `reported = true`로 표시하고 출제에서 뺀다. 그 풀이는 숙련도 계산에서 제외한다.

**면접형 문제** (`angle = MY_PROJECT`, `experience_id` 있음)

- 경험 카드를 먼저 보여주지 않는다. 사용자가 먼저 모달에 서술하게 한 뒤, 카드 내용(STAR+L)과 비교해 빠진 요소와 개선점을 피드백한다.

### 7.4 먼저 말 걸기

| 시각 | 내용 | Claude 호출 |
|---|---|---|
| 매일 03:00 | 증분 동기화 + 문제 풀 보충 (ACTIVE 개념마다 VALID 문제 3개 이상 유지, 우선순위 높은 개념부터) | 있음 (사용량 여유 시간대) |
| 매일 **07:30** | **아침 복습:** 복습할 개념의 문제를 최대 10개까지 `#복습-퀴즈`에 출제. 전날 저녁 주제를 반드시 포함 | 없음 (미리 만든 문제 사용) |
| 매일 18:30 | **오늘의 주제:** 근본 원인 후보, 약점, 다음 학습 개념 순으로 하나를 골라 관련 경험과 생각해볼 질문을 제시. 버튼: [이야기하기] [나중에] [건너뛰기] | 1회 |
| 일요일 20:00 | **주간 리포트** (`#리포트`): 학습량, 정답률 변화, 좋아진 개념·약한 개념, 반복 오개념, 트랙별 비중, 경험 카드 설명 연습 현황, 다음 주 추천, 자동 승인 개념 목록(되돌리기·병합 버튼) | 1회 |

- 복습할 개념이 없는 날은 아침 알림을 보내지 않는다.
- 같은 유형의 알림을 3번 연속 무시하면(`engaged_at` 없음) 그 유형의 빈도를 절반으로 줄이고, 주간 리포트에서 알린다.
- 알림 시각은 `/settings`로 변경할 수 있다.

**시간 배치 근거:** 저녁에 새 주제를 학습하고, 잠을 잔 뒤, 아침에 인출 연습을 하는 순서다. 수면 중 기억 공고화(Gais et al., 2006), 저녁 학습 → 수면 → 아침 재학습 순서의 효과(Mazza et al., 2016), 테스트 효과(Roediger & Karpicke, 2006), 간격 효과(Cepeda et al., 2006)에 근거한다. 아침이 인출에 특히 좋다는 시간대 효과 자체는 근거가 엇갈리므로, 시각은 설정으로 바꿀 수 있게 둔다.

### 7.5 튜터 교수 규칙 (시스템 프롬프트)

- 정답을 바로 주지 않는다. 먼저 사용자가 생각을 말하게 하고, 힌트는 단계적으로 준다.
- 설명할 때는 가능하면 사용자의 경험 카드와 연결한다.
- 웹 검색 결과를 쓰면 출처 링크를 단다.
- 사용자가 명시적으로 원하면 답을 보여준다(탈출구). 이때 `answer_revealed = true`로 기록하고, 관련 개념을 복습 우선순위에 올린다.

### 7.6 Discord 구성

- **개인 서버** (사용자와 봇만 참여)
  - `#복습-퀴즈`: 아침 복습, `/quiz`, `/review`
  - `#튜터`: 대화. 세션마다 스레드
  - `#리포트`: 주간 리포트
  - `#개념-관리`: 개념 승인 요청
  - `#관리`: 인증 만료, 수집 실패 등 운영 알림
- **채널 자동 준비:** 봇이 시작할 때 채널마다 `app_setting`(`discord.channel.<이름>`)에 저장된 ID의 채널을 찾는다. 없으면 같은 이름의 채널을, 그것도 없으면 새로 만들고 ID를 저장한다. 저장된 ID로 찾으므로 사용자가 채널 이름을 바꿔도 같은 채널을 쓴다.
- **소유자 전용:** 설정된 서버의 소유자(`DISCORD_OWNER_USER_ID`) 이벤트만 처리한다. 다른 사용자가 슬래시 명령을 쓰면 본인에게만 보이는 안내를 보내고, 메시지는 무시한다.
- **멘션 비활성:** LLM 응답에 `@everyone` 같은 멘션이 섞여도 알림이 가지 않도록 기본 멘션을 모두 끈다.
- **명령어:** `/quiz` `/review` `/end` `/sync` `/weakness` `/concepts` `/settings`
- **컴포넌트 ID 규칙:** 상태를 DB에서 다시 읽을 수 있도록 ID에 필요한 키를 담는다 (예: `quiz:answer:{questionId}:{choice}`, `quiz:confidence:{attemptId}:{level}`). 봇을 재시작해도 이전 메시지의 버튼이 동작한다.
- **상호작용 토큰:** 버튼을 누를 때마다 새로 발급되고 15분 뒤 만료된다(갱신 불가). 처리가 15분 안에 끝나면 원래 응답을 수정하고, 넘어가면 봇 토큰으로 새 메시지를 보낸다. 봇 토큰 자체는 만료되지 않는다.

---

## 8. 숙련도와 약점 추적

### 원칙

- 숙련도는 **힌트 없이, 확신을 갖고 답한 응답**으로만 인정한다. 연습 점수가 실력처럼 보이는 착시를 피하기 위해서다.
- Claude는 숙련도를 직접 판단하지 않는다. 채점(서술형)과 오개념 태깅만 하고, 점수 계산은 코드가 한다.

### 응답 → FSRS 등급 매핑

| 응답 | FSRS 등급 |
|---|---|
| 오답 | Again |
| 정답 + 찍음, 또는 힌트 사용 | Hard (숙련도 계산에서는 정답으로 세지 않음) |
| 정답 + 애매 | Good |
| 정답 + 확실 + 빠른 응답 | Easy |
| 오류 신고된 문제 | 반영하지 않음 |

### 약점 점수

```
mastery_score  = 힌트 없는 응답의 최근 가중 정답률 (지수이동평균)
weakness_score = (1 − mastery_score) × 확신도 보정 + 반복 오개념 가산점
  · 확신했는데 틀림 → 오개념으로 강하게 가산
  · 같은 오개념이 2회 이상 → 가산
  · 채점된 시도가 2회 미만 → "미측정" (약점과 구분)
  · weakness_score ≥ 0.5 → 약점
```

- **근본 원인 추적:** 한 개념의 하위 개념이 여러 개 약하면, 선수 개념(`PREREQUISITE`)을 재귀적으로 거슬러 올라가 숙련도가 낮은 개념을 근본 원인 후보로 표시한다. 근본 원인 후보는 저녁 주제와 출제에서 최우선 순위가 된다.
- **`/weakness`:** 트랙별 약점 상위 개념, 근본 원인 후보, 미측정 개념 수, 지난주 대비 변화를 보여준다.

---

## 9. 오류 처리

### `claude` CLI

- **인증 만료:** 출력에서 인증 오류를 감지하면 `#관리`에 한 번 알리고, Claude를 쓰는 예약 작업을 멈춘다. 다시 로그인하면 재개한다.
- **사용량 한도 도달:**
  - 급하지 않은 작업(문제 풀 보충, 추출)은 한도가 풀릴 때까지 미룬다.
  - 퀴즈는 미리 만든 문제로 계속한다.
  - 대화에는 재개 가능 시각을 안내한다.
- **타임아웃:** 1회 재시도한다.
- **JSON 형식 오류:** 1회 재요청하고, 그래도 실패하면 실패로 기록한다.

### Mac 잠자기와 놓친 실행

- 예약 작업의 실행 여부는 `outreach_log`와 작업 실행 기록으로 판단해 중복 실행을 막는다.
- 놓친 작업은 Mac이 깨어났을 때 정해진 시간 창 안이면 실행하고, 지났으면 건너뛴다 (예: 아침 복습은 11:00까지).
- 잠자기 방지(`pmset`, `caffeinate`) 설정은 운영 가이드에 기록한다.

### 수집

- 문서 단위로 실패를 격리하고, 실패한 문서는 다음 실행 때 재시도한다.
- Notion 호출 속도를 제한한다.
- velog API 형식이 바뀌어 수집이 실패하면 `#관리`에 알린다.

### Discord

- 게이트웨이 연결이 끊기면 discord.js가 자동으로 재연결한다.
- 상호작용 토큰이 만료되면 일반 메시지로 대체한다 (7.6 참고).

---

## 10. 테스트 전략

| 계층 | 방법 |
|---|---|
| 순수 로직 (FSRS, 숙련도·약점 점수, 개념 선택, 채점 정규화, 청크 비교) | Vitest 단위 테스트. FSRS는 `ts-fsrs` 버전을 고정하고 대표 시나리오를 기대 값으로 검증 |
| DB (재귀 CTE, 마이그레이션, 저장소) | Testcontainers PostgreSQL 통합 테스트 |
| LLM 연동 | `ClaudeClient` 인터페이스 + `FakeClaudeClient` (고정 JSON). 실제 응답 샘플로 파싱 테스트 |
| 프롬프트 품질 (추출, 출제, 검증, 채점) | 정답이 정해진 소규모 평가 세트 + 수동 평가 스크립트. 프롬프트를 바꿀 때마다 실행 |
| Discord | 유스케이스는 Discord 없이 테스트. 실제 동작은 개인 서버에서 수동 점검 체크리스트로 확인 |

---

## 11. 리서치 근거와 반영 사항

2026-10-12에 서브에이전트로 진행한 AI 튜터링 사례 리서치에서 다음을 채택했다.

| # | 채택 내용 | 근거 |
|---|---|---|
| 1 | FSRS 사용 | open-spaced-repetition 벤치마크 |
| 2 | 힌트 없이 낸 응답만 숙련도로 인정 | Bastani et al., PNAS 2025 (AI를 그냥 쓴 그룹이 AI 없는 시험에서 −17%) |
| 3 | 숙련도 계산은 코드로, Claude는 채점과 오개념 태깅만 | Duolingo의 Birdbrain(예측 모델)/GPT 역할 분리, LLM 제로샷 지식 추적의 한계 |
| 4 | 생성한 문제를 검증하는 단계와 오류 신고 버튼 | LLM 생성 문항 품질 연구 |
| 5 | 출제·채점 시 기준 자료 주입 | Kestin et al., Scientific Reports 2025 (Harvard 물리 연구) |
| 6 | "왜·언제·트레이드오프·내 프로젝트" 각도, 바꿔 묻기, 내 실수 기반 오답 보기 | Andy Matuschak의 노트, 오답 보기 연구 |
| 7 | 면접형 문제는 먼저 말해보게 한 뒤 경험 카드와 비교 | 인출 연습 원리 |
| 8 | 하루 복습 최대 10문제 (참여 유지 장치 중 상한만 채택) | 리뷰 부채로 인한 이탈 방지 |

리서치에서 제안된 나머지 참여 유지 장치(밀린 복습의 세부 처리 방식, 진척 지표 구성)는 4단계에서 사용 데이터를 보고 다시 판단한다. "답 보기" 탈출구는 7.5에 포함했다.

---

## 12. 범위 밖 (후속 과제)

- `career` 모듈: 이력서·포트폴리오 수정, Canva 연동 (MCP 서버를 `claude -p`에 연결하는 방식을 검토)
- 임베딩 기반 하이브리드 검색 (pgvector, 로컬 임베딩 모델)
- GitHub 등 추가 기억 출처
- FSRS 파라미터 최적화 (복습 기록이 수백 건 쌓인 뒤)
- 웹 대시보드

## 13. 구현 전에 정할 것

- velog 사용자명, 수집할 Notion 범위(워크스페이스 전체인지 특정 페이지·DB인지)
- 용도별 Claude 모델 기본값
- Discord 개인 서버와 봇 애플리케이션 생성 (사용자가 Developer Portal에서 직접 진행)
- Notion 통합(Integration) 토큰 발급과 페이지 공유 (사용자가 직접 진행)
