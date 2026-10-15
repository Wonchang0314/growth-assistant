# growth-assistant 설계 문서

- 작성일: 2026-10-12
- 갱신: 2026-10-14 (ADR-0018: 인터페이스를 Claude 앱 + MCP 서버로 변경, 맥미니 로컬에서 먼저 검증)
- 갱신: 2026-10-15 (ADR-0019: 핵심 학습 기능 먼저, 퀴즈는 객관식·빈칸부터, 먼저 말 걸기는 뒤로. 약점 기반 출제, 변형 문제 연결)
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

- Claude 앱에서 튜터링 대화와 복습을 이어갈 수 있다. 처음에는 맥미니의 Claude Desktop에서 직접 시작하고, 먼저 말 걸기(4단계)와 원격 전환(5단계) 뒤에는 아침 복습·저녁 주제를 모바일·아이패드에서도 받는다.
- 튜터가 대화와 문제에서 내 실제 경험(Notion·velog)을 근거로 연결한다.
- 개념별 숙련도와 약점이 객관적인 풀이 기록으로 추적되고, 주간 리포트로 변화가 보인다.
- 모든 LLM 사용이 Claude 구독(Claude 앱, `claude` CLI)으로 동작한다. API 키를 사용하지 않는다.

---

## 2. 확정된 결정 사항

| 항목 | 결정 | 근거 |
|---|---|---|
| 프로젝트 형태 | 별도 레포의 신규 프로젝트 (`JSL107/personal_agents`는 구조 참고용) | 사용자 결정 |
| 언어·프레임워크 | TypeScript + NestJS (ADR-0014, Kotlin + Spring Boot에서 전환) | 아는 언어로 백엔드 개념에 집중, 프로젝트 자체가 학습 겸 포트폴리오 |
| 인터페이스 | **Claude 앱 + MCP 서버.** 먼저 맥미니의 Claude Desktop에 로컬(stdio)로 붙이고, 품질 검증 뒤 원격 커스텀 커넥터로 전환 (ADR-0018, Discord·PWA에서 전환) | 채팅·모바일 앱을 직접 만들지 않아 유지보수 부담이 가장 작음. 인프라보다 퀴즈 품질을 먼저 검증 |
| 튜터링 대화 | Claude 앱의 모델이 한다. 서버는 맥락 조회·기록·채점 도구를 제공한다 | 대화 품질과 기록을 Claude 앱에 맡김 |
| 우선순위 | 튜터링 대화, 기억 연결, 퀴즈·복습, 숙련도·약점을 먼저 만든다. 먼저 말 걸기·알림·인증·보안은 뒤로 (ADR-0019) | 학습 촉진이라는 본질에 집중 |
| 퀴즈 유형 | 객관식·빈칸부터. 코드가 즉시 채점한다. 서술형(판단·트레이드오프 서술, 면접형 경험 서술)은 뒤로 (ADR-0019) | 채점이 빠르고 결정적. 서술형은 채점 기준표와 채점 품질 검증이 따로 필요 |
| 아침·저녁 학습 | 4단계로 미룬다. 그동안은 Claude Desktop 대화에서 직접 시작한다. 실행 방식은 핵심 기능 검증 뒤 정한다 (ADR-0019) | Cowork 예약 작업은 로컬 MCP를 못 쓰고, 클라우드 루틴은 로컬 MCP에 닿지 않음 |
| 실행 환경 | 맥미니 (ADR-0010). MCP 서버는 Claude Desktop이 띄우고, 서버 예약 작업은 launchd 상시 실행 앱에 둔다 | 사용자 결정 |
| 백그라운드 LLM | `claude -p` 서브프로세스 (구독 로그인 사용). 추출·출제·검증 (서술형을 만들면 서술형 채점도) | 대화 밖에서 도는 작업 |
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
| **1. MVP** | 로컬 MCP 서버(stdio), 첫 도구(학습 맥락 조회·학습 기록), 튜터 지침, Discord 코드 제거 | 맥미니 Claude Desktop에서 도구로 대화하고 학습 기록이 DB에 남음 |
| **2. 기억** | Notion·velog 수집, 경험 카드·개념 추출, 시드 개념, 승인 정책 | 백필 완료, 대화에서 Claude가 도구로 관련 경험 카드를 인용 |
| **3. 퀴즈·복습** | 객관식·빈칸 출제·검증·채점, 약점 기반 출제, 변형 문제, FSRS, 숙련도·약점 지도, 문제 피드백·출제 지침 편집 | 대화에서 복습 세트 풀기, 서버 채점, 약점 조회 동작. 퀴즈 품질에 만족 |
| **4. 먼저 말 걸기** | 핵심 기능 검증 뒤 예약 작업 실행 방식 결정(ADR-0019), 아침 복습, 저녁 주제, 주간 리포트, 정기 동기화·문제 풀 보충 | 예약된 시각에 Claude 앱에서 결과를 받음 |
| **5. 원격 전환** | 원격 커스텀 커넥터(Streamable HTTP), 공개 경로, 인증, 알림, MCP Apps 화면 검토 (새 ADR) | 모바일·아이패드 Claude 앱에서 같은 도구를 씀 |

---

## 4. 아키텍처

맥미니에서 실행하는 **NestJS 애플리케이션**(모듈러 모놀리스)과 Docker로 띄우는 **PostgreSQL 16**으로 구성한다. 같은 코드에 진입점을 둘 둔다.

- **MCP 진입점(stdio):** Claude Desktop이 필요할 때 띄운다. 도구 호출을 받아 유스케이스를 실행한다.
- **상시 실행 진입점:** launchd가 띄운다. 03:00 동기화·문제 풀 보충 같은 서버 예약 작업을 돌린다(필요해지는 2·4단계부터).

```
맥미니
┌────────────────────────────────────────────────────────────────┐
│ Claude Desktop (대화)                                             │
│        │ stdio                                                  │
│        ▼                                                        │
│ [MCP 진입점] 도구 처리기 ─┐      [상시 실행 진입점] 서버 예약 작업 ─┐ │
│                         ▼                                   ▼ │
│   ┌──────────────── core ────────────────┐                     │
│   │ mcp          도구 등록, 처리기 탐색     │                     │
│   │ memory       경험 카드, 원문 문서·청크   │                     │
│   │ knowledge    개념 그래프, 트랙           │                     │
│   │ ingestion    Notion·velog 수집, 증분 동기화│                   │
│   │ llm          ClaudeCliClient           │                     │
│   │ scheduler    예약 작업, 놓친 실행 복구    │                     │
│   ├──────────────── tutor ───────────────┤                     │
│   │ study        학습 맥락 조회, 학습 기록    │                     │
│   │ quiz         출제, 검증, 채점            │                     │
│   │ mastery      FSRS, 숙련도, 약점 지도     │                     │
│   │ outreach     아침 복습, 저녁 주제, 주간 리포트│                  │
│   └──────────────────────────────────────┘                     │
│             │                     │                            │
│             ▼                     ▼                            │
│      claude -p 서브프로세스      PostgreSQL (Docker)              │
│      (백그라운드 작업만)                                          │
└────────────────────────────────────────────────────────────────┘
```

### 원칙

- 모든 상태는 PostgreSQL에 둔다. 대화 내용은 Claude 앱에 남고, 서버에는 도구로 기록된 것만 남는다.
- **계산은 코드로, 생성과 대화는 LLM으로.** 스케줄링, 숙련도, 약점 점수, 채점 반영은 코드가 결정적으로 계산한다. Claude 앱은 대화를, `claude -p`는 추출·출제·검증·오개념 태깅을 맡는다(서술형을 만들면 서술형 채점도).
- **서버가 정답을 지킨다.** 도구 결과에 아직 풀지 않은 문제의 정답·채점 기준을 싣지 않는다. 답은 `submit_answer`로 받고 서버가 채점한다.
- `claude -p` 호출은 반드시 `ClaudeClient` 인터페이스(구현: `ClaudeCliClient`)를 거친다.
- MCP 도구 처리기는 MCP SDK 객체를 유스케이스에 넘기지 않고, 전송 방식(stdio·HTTP)을 모른다. 원격 전환 때 Streamable HTTP 진입점만 추가한다.
- 도구는 읽기와 학습 기록만 둔다. 삭제처럼 되돌릴 수 없는 도구는 만들지 않는다.
- 향후 `career` 모듈(이력서·포트폴리오, Canva 연동)이 `core`의 기억을 공유할 수 있도록 모듈을 `core` / `tutor`로 분리한다 (ADR-0015).

### 모듈 구조 (초안)

```
src/
├── main.ts          # 상시 실행 진입점 (서버 예약 작업, 4단계에서 만든다)
├── mcp-stdio.ts     # MCP 진입점 (Claude Desktop이 띄움)
├── core
│   ├── mcp          # MCP 서버, 도구 등록, 도구 처리기 탐색
│   ├── llm          # ClaudeClient, ClaudeCliClient, 프롬프트 템플릿, 호출 로그
│   ├── memory       # SourceDocument, DocumentChunk, Experience
│   ├── knowledge    # Track, Concept, ConceptEdge, ConceptGraphRepository
│   ├── ingestion    # Source 인터페이스, NotionSource, VelogSource, 동기화 서비스
│   └── scheduler    # 예약 작업, 실행 기록, 놓친 실행 복구
└── tutor
    ├── study        # 학습 맥락 조회, 학습 기록 도구, 서버 instructions
    ├── quiz
    ├── mastery
    └── outreach
```

`quiz` 모듈은 안을 `domain/`·`application/`·`infrastructure/`·`presentation/` 레이어 폴더로 나눠 시도한다(ADR-0020). 다른 모듈은 파일 이름 접미사로 역할을 구분한다(ADR-0015).

기능 모듈의 MCP 도구 처리기는 그 기능의 `mcp/` 폴더(`quiz`는 `presentation/mcp/`)에 두고, `core/mcp`가 데코레이터 탐색으로 모아 등록한다(`core`는 `tutor`를 import하지 않는다).

stdio 진입점에서는 표준출력이 MCP 메시지 통로이므로, 로그는 표준출력에 쓰지 않고 파일(또는 표준에러)에만 쓴다.

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
                type (MULTIPLE_CHOICE | FILL_BLANK),
                angle (WHY | WHEN | TRADEOFF | MY_PROJECT | MECHANISM),
                key_point,                 -- 이 문제가 확인하는 핵심 한 가지
                variant_of NULL,           -- 변형 문제면 원래 문제 ID
                difficulty (1~3), prompt,
                choices jsonb,             -- 객관식: [{ text, misconception NULL }]
                answer, accepted_answers text[],
                explanation, reference_material,
                experience_id NULL,
                validation_status (PENDING | VALID | INVALID),
                reported boolean, report_reason,
                used_count, created_at
quiz_attempt    id, question_id, user_answer, is_correct,
                confidence (SURE | UNSURE | GUESS),
                hint_used boolean, misconception,
                response_time_ms NULL, answered_at
```

- 유형은 객관식·빈칸만 둔다(ADR-0019). 둘 다 코드가 즉시 채점하므로 채점 대기 상태가 없다. 서술형을 만들 때 유형, 채점 기준표, 점수·피드백, 채점 대기 상태를 함께 추가한다(12장).
- 객관식 오답 보기마다 그 보기가 나타내는 오개념을 붙인다. 오답을 고르면 그 오개념이 `quiz_attempt.misconception`에 남는다. 빈칸 오답은 사용자가 쓴 답(`user_answer`)을 그대로 남기고 다음 출제 때 참고한다.
- `key_point`와 `variant_of`로 "같은 핵심을 다른 상황에서 다시 묻는" 변형 문제를 원래 문제와 연결한다(7.3).

- 출제 지침(문제 품질에 대한 내 요청)은 `app_setting`(`quiz.guideline`)에 두고, 출제 프롬프트에 넣는다.
- `response_time_ms`는 응답 시간을 잴 수 있는 화면(MCP Apps, 원격 전환 때 검토)에서만 채운다. 텍스트 대화에서는 비워 둔다.

### 5.5 학습 기록, 예약 실행, 운영

```
study_note           id, topic, summary, confused_points text[],
                     answer_revealed boolean, created_at
                     (대화 중 Claude가 record_study_note 도구로 남긴다)
study_note_concept   note_id, concept_id, signal (DISCUSSED | CONFUSED)
                     (개념 그래프와 함께 2단계에서 추가. 1단계는 study_note만)
outreach_log         id, type (MORNING_REVIEW | DAILY_TOPIC | WEEKLY_REPORT),
                     run_date, requested_at, engaged_at, payload jsonb
                     UNIQUE (type, run_date)
llm_call_log         id, purpose, model, duration_ms, success,
                     input_chars, output_chars, error, created_at
app_setting          key PK, value
```

- `outreach_log`는 예약 작업이 아침·저녁 도구를 부른 기록이다. 같은 날 다시 불리면 새로 고르지 않고 그날 고른 내용을 돌려준다.
- 1단계 전의 `conversation_session`·`conversation_message`(Discord 스레드 대화)는 Discord 코드와 함께 지웠다(마이그레이션 `0002_drop_conversation`).

### 5.6 관계 요약

```
track 1─N concept ─N:M─ concept (concept_edge)
concept 1─1 concept_mastery
concept 1─N quiz_question 1─N quiz_attempt
concept N:M experience (experience_concept)
concept N:M study_note (study_note_concept)
source_document 1─N document_chunk
source_document 1─N experience
```

---

## 6. 개념 어휘와 승인 정책

개념은 **통제 어휘**로 관리한다. 같은 개념이 여러 이름으로 흩어지지 않도록, Claude에게 항상 기존 개념 목록을 주고 "목록에서 먼저 고르고, 없을 때만 새 개념을 제안하라"고 지시한다.

| 단계 | 승인 방식 |
|---|---|
| 초기 시드 (트랙별 100~200개 + 관계) | Claude가 초안을 YAML로 생성하고, 사용자가 1회 검토 |
| 일회성 백필 | **조건부 자동 승인.** 기존 개념의 `PART_OF` 하위이면서 확신이 높으면 자동으로 `ACTIVE` 처리하고, 애매한 것은 승인 대기로 둔다. Claude 앱에서 "승인 대기 개념 보여줘"라고 하면 `list_pending_concepts`·`review_concept` 도구로 승인·거절·병합한다 |
| 정기 증분 동기화 | **자동 승인** + 안전장치 |
| 대화에서 나온 개념 | 증분 동기화와 같은 정책 |

### 자동 승인의 안전장치

1. **중복 검사 먼저:** 이름이나 별칭이 같거나 거의 같은 개념이 있으면, 새로 만들지 않고 기존 개념의 별칭으로 병합한다.
2. **사후 확인:** 그 주에 자동으로 추가·병합된 개념을 주간 리포트에 표시한다. 되돌리거나 병합하려면 대화에서 `review_concept` 도구로 처리한다. 아무것도 하지 않으면 확정된다.

### 승인 대기 중 동작

- 경험 카드는 `PROPOSED` 상태의 개념에도 즉시 연결한다.
- `PROPOSED` 개념은 숙련도 추적과 출제 대상에서 제외한다.
- 병합하면 연결이 기존 개념으로 옮겨진다.

---

## 7. 핵심 흐름

### 7.0 `ClaudeCliClient` (백그라운드 작업)

```
claude -p --output-format stream-json --verbose --model <용도별 설정>
       --setting-sources "" --strict-mcp-config --no-session-persistence
       --tools "" (주제 탐색만 --tools "WebSearch,WebFetch" --allowedTools 같은 값)
       [--system-prompt <프롬프트>] [--json-schema <스키마>]
```

- 대화는 Claude 앱이 하므로, 이 클라이언트는 수집·추출, 출제·검증, 요약 같은 대화 밖 작업에만 쓴다(서술형을 만들면 서술형 채점도).
- 프롬프트는 표준입력으로 전달한다. 출력은 줄마다 JSON 이벤트 하나이며, 끝까지 읽은 뒤 `result` 이벤트와 마지막 `rate_limit_event`만 해석한다 (ADR-0012).
- 성공 여부는 `is_error`로 판단한다(`subtype`은 오류여도 `"success"`일 수 있다). 미로그인은 `result` 문자열(`Not logged in`)로, 한도 초과는 `rate_limit_event`의 상태와 `resetsAt`으로 판별한다.
- 구조화된 출력은 `--json-schema`로 받아 `structured_output`을 zod 스키마로 다시 검증한다. `--json-schema`에 넘기는 JSON Schema도 같은 zod 스키마에서 만든다.
- 빈 전용 작업 디렉터리에서 실행한다. 이 디렉터리와 상위 디렉터리에 CLAUDE.md가 없어야 한다. `--setting-sources ""`가 CLAUDE.md 로드를 막는 것은 스파이크로 확인했다.
- 실행 파일 경로는 설정값으로 받는다 (OS마다 다를 수 있다). `--bare`는 구독 로그인을 읽지 않아 쓰지 않는다.
- 도구는 기본적으로 끈다. 주제 탐색 호출에만 `WebSearch`, `WebFetch`를 허용한다.
- 동시 실행은 최대 2개(세마포어). 용도별 타임아웃을 두고, 타임아웃이 나면 1회 재시도한다.
- JSON 형식이 깨지면 오류 내용을 붙여 1회 재요청한다.
- 모든 호출을 `llm_call_log`에 기록한다.
- 용도별 모델은 설정 파일에서 지정한다 (예: 추출·출제는 Opus, 채점은 Sonnet).

### 7.1 수집 (백필, 증분 동기화)

```
트리거: 최초 백필, sync_now 도구, 매일 03:00 (상시 실행 진입점)

1. 소스별로 변경된 문서를 조회한다 (sync_cursor 이후 수정된 Notion 페이지, velog 글)
2. 청크로 나눈다 (Notion: 블록, velog: 문단) → 청크 해시를 비교해 추가·수정·삭제된 청크를 찾는다
3. 바뀐 청크가 없으면 건너뛴다
4. Claude 추출 호출
   - 입력: 바뀐 청크 + 문서 요약 + 이 문서에서 이미 뽑은 경험 카드 + 개념 목록
   - 출력: 경험 카드 추가·수정안, 개념 매핑, 새 개념 제안, 갱신된 문서 요약
5. 하나의 트랜잭션으로 반영하고 승인 정책을 적용한다
6. 실패한 문서는 FAILED로 표시하고, 다음 실행 때 재시도한다 (다른 문서 처리는 계속)
```

- `sync_now`는 동기화를 시작만 하고 바로 돌려준다. 결과는 `sync_status` 같은 조회로 확인한다.
- Notion API 호출 속도는 초당 약 3회로 제한한다.
- velog는 비공식 GraphQL API를 쓰므로, 어댑터를 분리하고 수집이 실패하면 로그와 다음 주간 리포트에 남긴다.

### 7.2 튜터링 대화

```
시작: Claude Desktop에서 새 대화를 열고 질문한다 (MCP 서버가 켜져 있으면 도구를 쓸 수 있다)
     튜터 지침을 넣은 Claude 프로젝트 안에서 대화하면 지침이 항상 적용된다
     저녁 주제·퀴즈 결과 대화에서 이어서 물어봐도 같은 흐름이다

대화 중:
 1. Claude가 get_learning_context(topic)를 부른다
    → 관련 개념(별칭 매칭), 그 개념의 숙련도, 약한 선수 개념, 관련 경험 카드, 최근 학습 기록
 2. Claude가 교수 규칙(7.5)에 따라 대화한다. 웹 검색은 Claude 앱 기능을 쓴다
 3. 대화가 마무리되거나 헷갈린 지점이 분명해지면 Claude가 record_study_note를 부른다
    → 주제, 요약, 헷갈린 점, 답 공개 여부, 관련 개념(DISCUSSED | CONFUSED)
    → 대화에서 새 경험이 드러나면 경험 카드 후보로 저장한다 (자동 승인 정책)
```

- 세션, 메시지 저장, 유휴 종료, 대화 요약은 서버에 두지 않는다. Claude 앱의 대화가 그 역할을 한다.
- `record_study_note`는 Claude가 불러야만 남는다. MCP 서버의 `instructions`와 도구 설명, Claude 프로젝트 지침으로 부르도록 유도하고, 반드시 남는다고 가정하지 않는다.
- 대화 결과로는 숙련도 점수를 바꾸지 않는다. `CONFUSED` 신호는 출제 우선순위만 올린다. 숙련도는 퀴즈 결과로만 갱신한다.

### 7.3 퀴즈와 복습

```
시작: Claude Desktop 대화에서 "복습하자", "OO 문제 내줘" (get_review_set)
     아침 복습 예약 작업은 4단계에서 붙인다 (ADR-0019)

1. 개념 선택 우선순위
   ① due_at ≤ 지금인 개념 (4단계 뒤: 전날 저녁 주제 개념은 반드시 포함)
   ② 약점 개념, CONFUSED 신호가 있는 개념
   ③ 트랙 가중치에 따른 새 개념
   하루 최대 10문제. 넘치면 우선순위가 높은 것만 낸다
2. 개념마다 낼 문제를 고른다 (아래 "변형 문제")
   ① 그 개념에서 틀렸거나 불안하게 맞힌 문제가 있으면 그 문제의 변형
   ② 없으면 이미 확인한 핵심의 변형과 아직 묻지 않은 핵심을 번갈아
   풀에 VALID인 문제가 없으면 즉석 생성 + 검증. 한 번 낸 문제는 그대로 다시 내지 않는다
3. get_review_set은 문제 ID, 유형, 질문, 보기만 돌려준다 (정답·해설·기준 자료 없음)
4. Claude가 한 문제씩 묻고, 답을 들은 뒤 확신도(확실·애매·찍음)를 묻는다
5. Claude가 submit_answer(questionId, answer, confidence, hintUsed)를 부른다 → 서버가 즉시 채점
   - 객관식: 정답과 비교. 오답이면 고른 보기의 오개념을 기록
   - 빈칸: answer와 accepted_answers로 비교 (공백·대소문자·전각/반각 정규화)
6. 결과(정오, 해설, 기록된 오개념, 관련 경험 카드)를 돌려주고 Claude가 설명을 이어간다
7. 갱신: FSRS 상태, 숙련도·약점 점수 (8장 규칙)
```

- 텍스트로 묻고 답한다. 객관식 버튼, 확신도 버튼, 응답 시간 측정은 원격 전환 때 MCP Apps로 검토한다.
- 확신도와 힌트 사용 여부는 Claude가 대화에서 받아 넘긴다. 빠지면 `UNSURE`, 힌트 사용으로 보수적으로 처리한다.
- 채점은 LLM을 부르지 않으므로 사용량 한도와 상관없이 미리 만든 문제로 복습을 이어 간다.
- 즉석 생성은 수십 초 걸릴 수 있다. 문제 풀 보충(7.4)이 생기기 전까지는 감수한다.

**문제 생성 규칙**

- 출제 각도는 "왜 / 언제 쓰나 / 트레이드오프 / 동작 원리 / 내 프로젝트에서는"을 우선한다. "용어 ↔ 정의" 형태는 피한다.
- 같은 개념을 복습할 때마다 다른 문제(바꿔 묻기)를 낸다.
- 문제마다 확인할 핵심(`key_point`)을 하나만 둔다. 핵심이 둘이면 문제를 나눈다.
- 출제할 때 기준 자료(정답 근거, 해설, 출처: 경험 카드나 웹 자료)를 함께 넣고, `reference_material`에 저장한다.
- **약점을 문제 내용에 반영한다.** 출제 프롬프트에 그 개념의 최근 오개념(`quiz_attempt.misconception`), 빈칸 오답, 학습 기록의 헷갈린 점(`study_note.confused_points`), 경험 카드에 적힌 내 실수를 넣는다. 오답 보기와 빈칸 자리는 이 지점을 겨냥한다. 근거가 없으면 흔한 오개념으로 만든다.
- 빈칸은 답이 거의 하나로 정해지는 용어·값 자리에 둔다. 표기가 갈리는 답(약어, 영문·한글)은 `accepted_answers`에 모두 넣는다.
- 출제 지침(`quiz.guideline`)을 프롬프트에 넣는다. "이런 문제는 내지 마" 같은 요청은 대화에서 `update_quiz_guideline` 도구로 고친다(재배포 없이 품질 조정).

**변형 문제** (망각 방지)

- 복습 시기는 FSRS가 개념 단위로 정한다(ADR-0016). 그 개념을 다시 낼 때 이미 풀었던 문제를 그대로 내지 않고, 같은 `key_point`를 다른 상황으로 묻는 변형을 낸다(`variant_of`에 원래 문제).
- 틀렸거나, 찍어서 맞혔거나, 힌트를 쓴 문제는 다음 복습 때 변형을 우선 낸다. 확실하게 맞힌 핵심도 간격을 두고 변형으로 다시 확인한다.
- 문장만 바꾸면 이해가 아니라 "그 문제 답은 B였지"라는 기억으로 풀게 된다. 핵심은 그대로 두고 상황·조건·각도(왜 → 언제 쓰나 → 이 조건에서도 맞나)를 바꾸고, 유형(객관식 ↔ 빈칸)도 바꿀 수 있다.
- 변형 문제 생성 프롬프트에는 원래 문제, 그때의 답과 오개념을 넣는다.

**검증 단계와 피드백**

- 문제를 생성한 직후 별도 Claude 호출로 확인한다: 정답이 하나뿐인지, 정답이 보기 안에 있는지(객관식), 허용 답이 맞는 표기를 모두 담는지(빈칸), 기준 자료만으로 풀 수 있는지. 변형 문제는 원래 문제와 핵심이 같은지, 원래 문제의 답을 외워서는 풀 수 없을 만큼 다른지도 확인한다.
- 통과한 문제만 `VALID`가 된다.
- 대화에서 "이 문제 이상해"라고 하면 Claude가 `report_question(questionId, reason)`을 부른다. `reported = true`로 표시하고 출제에서 뺀다. 그 풀이는 숙련도 계산에서 제외한다. 신고 이유는 출제 지침을 고칠 때 참고한다.

**내 프로젝트 문제** (`angle = MY_PROJECT`, `experience_id` 있음)

- 지금은 객관식·빈칸으로만 낸다. 예: "이 프로젝트에서 X 대신 Y를 고른 이유로 맞는 것은?" 경험 카드는 문제에 싣지 않고, `submit_answer` 결과로 보여 준다.
- 경험을 먼저 말로 설명하게 하고 카드 내용(STAR+L)과 비교하는 면접형 서술 연습은 서술형과 함께 미룬다(ADR-0019, 12장). 그동안은 튜터링 대화에서 연습한다.

### 7.4 먼저 말 걸기

**4단계로 미룬다 (ADR-0019).** 그 전까지는 Claude Desktop 대화에서 "복습하자"처럼 직접 시작한다. 아래 내용과 시각은 4단계의 목표이고, 실행 방식은 핵심 기능(1~3단계)을 검증한 뒤 정한다.

서버는 Claude 앱에 먼저 말을 걸 수 없다. 정해진 시각에 Claude 쪽 예약 작업이 도구를 불러 대화를 만들어야 한다.

- 확인한 것(2026-10-14): Cowork 예약 작업은 로컬 MCP 서버를 쓸 수 없다. Claude Code 클라우드 루틴은 Anthropic 클라우드에서 돌아 로컬 MCP에 닿지 않는다.
- 남은 후보: Claude Code 데스크톱 예약 작업(이 레포의 MCP 설정 사용, 맥미니가 깨어 있고 앱이 켜져 있어야 함), 원격 전환(5단계) 뒤의 예약 작업·클라우드 루틴.
- 정할 때 확인할 것: 예약 작업이 MCP 도구를 부르는지, 실행 결과를 휴대폰 Claude 앱에서 볼 수 있는지, 그 대화를 이어갈 때 도구를 쓸 수 있는지.

| 시각 | 내용 | 실행 주체 |
|---|---|---|
| 매일 03:00 | 증분 동기화 + 문제 풀 보충 (ACTIVE 개념마다 VALID 문제 3개 이상 유지, 우선순위 높은 개념부터) | 상시 실행 진입점(launchd), `claude -p` (사용량 여유 시간대) |
| 매일 **07:30** | **아침 복습:** `get_review_set`으로 복습할 개념의 문제를 최대 10개까지 낸다. 전날 저녁 주제를 반드시 포함 | Claude 예약 작업 (미리 만든 문제 사용) |
| 매일 18:30 | **오늘의 주제:** `get_daily_topic`이 근본 원인 후보, 약점, 다음 학습 개념 순으로 하나를 고르고 관련 경험을 돌려준다. Claude가 생각해볼 질문을 만든다 | Claude 예약 작업 |
| 일요일 20:00 | **주간 리포트:** `get_weekly_report`가 학습량, 정답률 변화, 좋아진 개념·약한 개념, 반복 오개념, 트랙별 비중, 경험 카드 설명 연습 현황, 자동 승인 개념 목록, 수집 실패를 돌려주고, Claude가 정리하고 다음 주를 추천한다 | Claude 예약 작업 |

- 복습할 개념이 없는 날은 `get_review_set`이 "오늘은 복습 없음"을 돌려준다.
- 반응했는지(`engaged_at`)는 그 날의 도구가 실제로 쓰였는지(답안 제출, 주제 대화 기록)로 판단한다. 같은 유형을 3번 연속 무시하면 주간 리포트에서 알리고 시각·빈도 조정을 권한다. 예약 작업의 일정은 Claude 앱에서 바꾼다.

**시간 배치 근거:** 저녁에 새 주제를 학습하고, 잠을 잔 뒤, 아침에 인출 연습을 하는 순서다. 수면 중 기억 공고화(Gais et al., 2006), 저녁 학습 → 수면 → 아침 재학습 순서의 효과(Mazza et al., 2016), 테스트 효과(Roediger & Karpicke, 2006), 간격 효과(Cepeda et al., 2006)에 근거한다. 아침이 인출에 특히 좋다는 시간대 효과 자체는 근거가 엇갈리므로, 시각은 설정으로 바꿀 수 있게 둔다.

### 7.5 튜터 교수 규칙

MCP 서버의 `instructions`(연결 시 Claude에 전달)와 튜터용 Claude 프로젝트 지침에 같은 규칙을 둔다. 둘 다 강제는 아니므로, 점수에 영향을 주는 부분(정답 공개, 채점)은 서버가 지킨다.

- 서버 `instructions`(`src/tutor/study/prompts/mcp-instructions.md`)는 서버가 연결된 모든 대화에 전달된다. 학습과 상관없는 대화에서는 도구를 부르지 않게 하고, 도구를 부르는 때·학습 기록 쓰는 법·교수 규칙만 둔다.
- Claude 프로젝트 지침(`docs/claude-project-instructions.md`, 사용자가 프로젝트에 붙여 넣음)은 튜터 프로젝트 안의 대화에만 적용된다. 역할, 진행 방식(대화 시작, 묻는 각도, 내 프로젝트와 연결), 형식을 둔다.
- 퀴즈 규칙(아래 마지막 항목)은 3단계에서 퀴즈 도구와 함께 두 지침에 넣는다.

- 정답을 바로 주지 않는다. 먼저 사용자가 생각을 말하게 하고, 힌트는 단계적으로 준다.
- 설명할 때는 `get_learning_context`로 받은 경험 카드와 연결한다.
- 웹 검색 결과를 쓰면 출처 링크를 단다.
- 사용자가 명시적으로 원하면 답을 보여준다(탈출구). 이때 `record_study_note`에 `answer_revealed = true`로 남기고, 관련 개념은 복습 우선순위에 오른다.
- 퀴즈 중에는 `submit_answer` 전에 정답을 말하지 않는다(서버도 결과 전에는 정답을 주지 않는다).

### 7.6 로컬 MCP 구성

- **SDK:** 공식 TypeScript SDK v2(`@modelcontextprotocol/server`)를 쓴다. v1 `@modelcontextprotocol/sdk`를 잇는 안정 버전이고, 2024-11-05 이후 프로토콜 버전을 모두 협상할 수 있다.
- **연결:** Claude Desktop 설정에 MCP 서버를 등록한다(`claude_desktop_config.json` 또는 `.mcpb` 확장). Desktop이 `node <배포 경로>/dist/mcp-stdio.js`를 띄우고 stdio로 통신한다. 환경 변수(DB 주소, `claude` 실행 파일 경로)는 설정에 넣거나 `.env`에서 읽는다. Desktop이 띄우는 프로세스의 작업 디렉터리는 프로젝트 루트가 아닐 수 있으므로 `.env` 경로를 `GROWTH_ENV_FILE`로 준다.
- **실행 위치:** 개발 중인 작업 트리가 아니라 빌드된 릴리스 디렉터리를 가리킨다. 코드를 고치는 중에 Desktop의 도구가 깨지지 않게 하기 위해서다(배포 방식은 `docs/ops.md`).
- **프로세스:** Desktop이 띄우고 끈다. 시작할 때 DB 마이그레이션은 하지 않고, 마이그레이션이 덜 됐으면 도구가 오류를 돌려준다. 마이그레이션은 배포 때 한다.
- **로그:** 표준출력은 MCP 메시지 통로라 쓰지 않는다. 로그는 `LOG_DIR/mcp`의 회전 파일에 쓴다(상시 실행 앱과 디렉터리를 나눈다). `LOG_DIR`가 없으면 표준에러에 쓴다(Claude Desktop의 MCP 로그에 남는다).
- **도구 설계**
  - 도구 이름은 동사로 시작하고, 설명에 "언제 부르는지"를 쓴다(Claude가 고르는 근거).
  - 입력은 zod 스키마로 정의하고 검증한다.
  - 결과는 Claude가 읽을 짧은 텍스트와 구조화된 내용을 함께 준다. 아직 풀지 않은 문제의 정답은 싣지 않는다.
  - 되돌릴 수 없는 도구(삭제)는 만들지 않는다.
- **단계별 도구**

| 단계 | 도구 |
|---|---|
| 1 | `get_learning_context`, `record_study_note` |
| 2 | `search_experience`, `list_pending_concepts`, `review_concept`, `sync_now`, `sync_status` |
| 3 | `get_review_set`, `submit_answer`, `report_question`, `get_weakness`, `update_quiz_guideline` |
| 4 | `get_daily_topic`, `get_weekly_report` |

---

## 8. 숙련도와 약점 추적

### 원칙

- 숙련도는 **힌트 없이, 확신을 갖고 답한 응답**으로만 인정한다. 연습 점수가 실력처럼 보이는 착시를 피하기 위해서다.
- Claude는 숙련도를 직접 판단하지 않는다. 객관식·빈칸은 코드가 채점하고, 오개념은 출제할 때 오답 보기에 붙여 둔 것을 기록한다. 점수 계산도 코드가 한다.

### 응답 → FSRS 등급 매핑

| 응답 | FSRS 등급 |
|---|---|
| 오답 | Again |
| 정답 + 찍음, 또는 힌트 사용 | Hard (숙련도 계산에서는 정답으로 세지 않음) |
| 정답 + 애매 | Good |
| 정답 + 확실 + 빠른 응답 (응답 시간이 없으면 정답 + 확실) | Easy |
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
- **`get_weakness` 도구:** 트랙별 약점 상위 개념, 근본 원인 후보, 미측정 개념 수, 지난주 대비 변화를 돌려준다.

---

## 9. 오류 처리

이 단계에는 별도 알림 경로가 없다. 운영 문제는 로그 파일에 남기고, 사용자가 알아야 할 것은 도구 결과(대화 중 Claude가 전달)와 주간 리포트로 보여 준다. 알림 경로는 원격 전환 때 정한다.

### `claude` CLI

- **인증 만료:** 출력에서 인증 오류를 감지하면 로그에 남기고, 그 뒤 도구 결과에 "맥미니에서 `claude` 다시 로그인 필요"를 함께 돌려준다. Claude를 쓰는 서버 예약 작업은 멈추고, 다시 로그인하면 재개한다.
- **사용량 한도 도달:**
  - 급하지 않은 작업(문제 풀 보충, 추출)은 한도가 풀릴 때까지 미룬다.
  - 퀴즈는 미리 만든 문제로 계속한다. 채점은 LLM을 쓰지 않으므로 영향이 없다. 풀에 문제가 없으면 즉석 생성이 실패하고, 도구가 그 이유를 돌려준다.
  - Claude 앱의 대화도 같은 구독 한도를 쓴다. 한도에 걸리면 Claude 앱이 안내한다.
- **타임아웃:** 1회 재시도한다.
- **JSON 형식 오류:** 1회 재요청하고, 그래도 실패하면 실패로 기록한다.

### Mac 잠자기와 놓친 실행

- 맥미니가 잠들면 서버 예약 작업(2·4단계)과 4단계의 Claude 예약 작업이 돌지 않는다. 잠자기 방지(`pmset`)는 설정했고 운영 가이드에 기록했다.
- 서버 예약 작업의 실행 여부는 작업 실행 기록으로 판단해 중복 실행을 막는다.
- 놓친 서버 작업은 Mac이 깨어났을 때 정해진 시간 창 안이면 실행하고, 지났으면 건너뛴다.
- Claude 예약 작업(4단계)은 그때 고른 방식의 규칙을 따른다. 같은 날 두 번 불려도 `outreach_log`로 같은 내용을 돌려준다.

### 수집

- 문서 단위로 실패를 격리하고, 실패한 문서는 다음 실행 때 재시도한다.
- Notion 호출 속도를 제한한다.
- velog API 형식이 바뀌어 수집이 실패하면 로그와 주간 리포트에 남긴다.

### MCP 프로세스

- DB가 꺼져 있거나 마이그레이션이 덜 됐으면 도구가 원인을 담은 오류를 돌려준다. Claude가 대화에서 그대로 전달한다.
- 처리하지 않은 예외로 프로세스가 끝나면 Desktop이 도구를 쓸 수 없다고 표시한다. 도구 처리기 진입점에서 예외를 모두 잡아 오류 결과로 바꾼다.

---

## 10. 테스트 전략

| 계층 | 방법 |
|---|---|
| 순수 로직 (FSRS, 숙련도·약점 점수, 개념·문제 선택, 채점 정규화, 청크 비교) | Vitest 단위 테스트. FSRS는 `ts-fsrs` 버전을 고정하고 대표 시나리오를 기대 값으로 검증 |
| DB (재귀 CTE, 마이그레이션, 저장소) | Testcontainers PostgreSQL 통합 테스트 |
| LLM 연동 | `ClaudeClient` 인터페이스 + `FakeClaudeClient` (고정 JSON). 실제 응답 샘플로 파싱 테스트 |
| MCP 도구 | 유스케이스는 MCP 없이 테스트. 도구 등록·입력 검증·결과 형식은 MCP SDK 클라이언트를 메모리 전송으로 붙여 확인한다(정답이 결과에 새지 않는지 포함) |
| 프롬프트 품질 (추출, 출제, 변형 출제, 검증) | 정답이 정해진 소규모 평가 세트 + 수동 평가 스크립트. 프롬프트를 바꿀 때마다 실행 |
| Claude 앱 연동 | 맥미니 Claude Desktop에서 수동 점검 체크리스트로 확인 (도구 호출, 학습 기록, 퀴즈 풀이) |

---

## 11. 리서치 근거와 반영 사항

2026-10-12에 서브에이전트로 진행한 AI 튜터링 사례 리서치에서 다음을 채택했다.

| # | 채택 내용 | 근거 |
|---|---|---|
| 1 | FSRS 사용 | open-spaced-repetition 벤치마크 |
| 2 | 힌트 없이 낸 응답만 숙련도로 인정 | Bastani et al., PNAS 2025 (AI를 그냥 쓴 그룹이 AI 없는 시험에서 −17%) |
| 3 | 숙련도 계산은 코드로, Claude는 채점과 오개념 태깅만 | Duolingo의 Birdbrain(예측 모델)/GPT 역할 분리, LLM 제로샷 지식 추적의 한계 |
| 4 | 생성한 문제를 검증하는 단계와 오류 신고 | LLM 생성 문항 품질 연구 |
| 5 | 출제·채점 시 기준 자료 주입 | Kestin et al., Scientific Reports 2025 (Harvard 물리 연구) |
| 6 | "왜·언제·트레이드오프·내 프로젝트" 각도, 바꿔 묻기, 내 실수 기반 오답 보기 | Andy Matuschak의 노트, 오답 보기 연구 |
| 7 | 면접형 문제는 먼저 말해보게 한 뒤 경험 카드와 비교 (서술형과 함께 미룸, ADR-0019) | 인출 연습 원리 |
| 8 | 하루 복습 최대 10문제 (참여 유지 장치 중 상한만 채택) | 리뷰 부채로 인한 이탈 방지 |

리서치에서 제안된 나머지 참여 유지 장치(밀린 복습의 세부 처리 방식, 진척 지표 구성)는 4단계에서 사용 데이터를 보고 다시 판단한다. "답 보기" 탈출구는 7.5에 포함했다.

---

## 12. 범위 밖 (후속 과제)

- **원격 전환 (5단계, 새 ADR로 결정).** 2026-10-14 조사 결과를 출발점으로 쓴다(ADR-0018 맥락).
  - 연결: Streamable HTTP 진입점을 추가해 Claude 커스텀 커넥터로 등록한다. 웹에서 추가하면 데스크톱·iOS에서도 쓴다.
  - 공개 경로: Tailscale Funnel(도메인 불필요, 원래 접속 IP 전달 여부 미확인) 또는 Cloudflare Tunnel(도메인 필요, `CF-Connecting-IP`와 경계 차단 확실). 앱은 `127.0.0.1`에만 바인딩한다.
  - 인증: OAuth 2.1 최소 구현(고정 `client_id`, 비밀번호 로그인, PKCE, 짧은 액세스 토큰, 회전하는 리프레시 토큰, 토큰은 해시로 저장). 고정 헤더 인증(Request headers)이 그때 열려 있으면 대신 쓸지 검토한다.
  - IP 제한: `/mcp`·`/token`은 Anthropic 외부 요청 대역(`160.79.104.0/21`)만 허용한다. 모든 Claude 사용자가 공유하는 대역이라 인증을 대신하지 못한다. `/authorize`는 사용자 브라우저가 열므로 제외한다.
  - 알림: 학습 알림은 Claude 예약 작업·클라우드 루틴의 휴대폰 푸시 여부를 확인해 정하고, 안 되면 ntfy. 운영 알림(인증 만료, 작업 실패, 서버 다운)은 ntfy + 헬스체크 감시.
  - 화면: MCP Apps로 객관식·확신도 버튼과 응답 시간 측정을 검토한다(iOS는 WKWebView로 지원).
- **서술형 문제 (ADR-0019로 미룸).** 객관식·빈칸 품질을 확인한 뒤 설계한다.
  - 판단형: 제약이 있는 상황을 주고 "무엇을 고르고 왜, 무엇을 포기하나"를 묻는다. 결론보다 근거를 본다.
  - 면접형: 내 경험을 먼저 설명하게 한 뒤 경험 카드(STAR+L)와 비교해 빠진 요소를 피드백한다.
  - 채점 기준표(예: 제약 파악, 대안 비교, 트레이드오프 명시, 결론과 근거의 일관성, 내 경험 연결)를 문제와 함께 저장하고, `claude -p`가 항목별로 채점한다. 검증은 "정답이 하나뿐인가" 대신 "기준표만으로 채점할 수 있는가"를 본다.
  - 사용량 한도에 걸리면 채점을 보류하고 나중에 채점한다.
- `career` 모듈: 이력서·포트폴리오 수정, Canva 연동 (같은 MCP 서버에 도구로 추가하는 방식을 검토)
- 임베딩 기반 하이브리드 검색 (pgvector, 로컬 임베딩 모델)
- GitHub 등 추가 기억 출처
- FSRS 파라미터 최적화 (복습 기록이 수백 건 쌓인 뒤)
- 문제 생성 같은 백그라운드 작업을 Claude 예약 작업으로 옮겨 `claude -p`를 줄일지 검토

## 13. 구현 전에 정할 것

- velog 사용자명, 수집할 Notion 범위(워크스페이스 전체인지 특정 페이지·DB인지)
- 용도별 Claude 모델 기본값
- 맥미니 Claude Desktop에 MCP 서버 등록, 튜터용 Claude 프로젝트 지침 작성 (사용자가 직접 진행, 설정 예시는 운영 가이드에)
- Notion 통합(Integration) 토큰 발급과 페이지 공유 (사용자가 직접 진행)
