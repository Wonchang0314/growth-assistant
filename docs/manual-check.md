# 수동 점검 체크리스트

자동 테스트가 닿지 않는 부분(Claude 앱이 도구를 고르는 방식, 지침을 따르는지, 실제 운영 환경)을 맥미니의 Claude Desktop에서 직접 확인한다. 배포한 뒤나 지침·도구 설명을 고친 뒤에 해당 단계 항목을 다시 확인한다. 발견한 문제는 `docs/handoff.md`나 이슈로 남긴다.

## 1단계: Desktop 연결과 학습 기록

**준비:** `ops/deploy.sh` → `ops/desktop-config.sh` 출력을 Desktop 설정에 넣음 → Desktop 다시 시작 ([운영 가이드](ops.md) 처음 설치 7번). 튜터 프로젝트를 만들고 지침에 `docs/claude-project-instructions.md` 본문을 넣는다.

### 연결

- [ ] Settings → Developer에 `growth-assistant`가 running으로 보인다
- [ ] 대화 입력창의 도구(연결) 메뉴에 `get_learning_context`, `record_study_note`가 보인다
- [ ] `LOG_DIR/mcp/current.log`에 `MCP 연결: 도구 record_study_note, get_learning_context`가 남는다

### 도구를 부르는 때 (서버 instructions)

- [ ] 튜터 프로젝트 밖의 학습과 무관한 대화(예: "이 문장 영어로 바꿔줘")에서는 도구를 부르지 않는다
- [ ] 튜터 프로젝트에서 "PostgreSQL 인덱스 공부하자"라고 하면 `get_learning_context`를 먼저 부르고, 기록이 없으면 지금 얼마나 아는지 묻는다

### 튜터링과 학습 기록 (프로젝트 지침)

- [ ] 바로 정답을 주지 않고 먼저 설명해 보라고 한다. 한 번에 질문을 하나만 한다
- [ ] 주제를 마무리하면 `record_study_note`를 부른다. Desktop이 쓰기 도구 승인을 물으면 허용한다
- [ ] 저장된 기록의 헷갈린 점이 "~라고 생각함"처럼 내가 실제로 믿었던 틀린 문장으로 적혀 있다
  ```bash
  docker compose exec postgres psql -U growth growth \
    -c "SELECT id, topic, confused_points, answer_revealed, created_at FROM study_note ORDER BY id DESC LIMIT 5;"
  ```
- [ ] "답 알려줘"라고 하면 바로 답을 주고, 그 주제 기록의 `answer_revealed`가 true다
- [ ] 새 대화에서 같은 주제를 꺼내면 지난번 헷갈린 점부터 묻는다

### 개념 연결 (2단계 개념 그래프)

- [ ] `get_learning_context` 결과에 관련 개념과 먼저 알아야 할 개념이 나오고, 설명이 막히면 선수 개념을 아는지 확인한다
- [ ] `record_study_note`의 `concepts`에 `get_learning_context`가 돌려준 개념 이름이 들어가고, 헷갈린 개념은 `CONFUSED`다
  ```bash
  docker compose exec postgres psql -U growth growth \
    -c "SELECT n.topic, c.name, l.signal FROM study_note_concept l JOIN study_note n ON n.id = l.note_id JOIN concept c ON c.id = l.concept_id ORDER BY n.id DESC LIMIT 10;"
  ```
- [ ] 다른 표현(영문, 약어)으로 같은 주제를 꺼내도 그 개념에 연결된 지난 기록을 찾는다

### 오류

- [ ] `docker compose stop postgres` 뒤 학습 주제를 꺼내면, Claude가 DB 연결 실패(`ECONNREFUSED`)로 도구를 쓰지 못했다고 알려 준다. 서버는 계속 running이다. 확인 뒤 `docker compose start postgres`

### 기록

| 날짜 | 릴리스 | 결과 | 발견한 문제 |
|---|---|---|---|
| 2026-10-17 | `20261017-163436` | 1단계 전 항목 통과. 학습 기록 5건, 헷갈린 개념 `CONFUSED` 연결, "답 알려줘" 뒤 `answer_revealed`, 별칭("isolation level")으로 지난 오개념 재확인, DB 중지 때 오류 안내 후 재시작하면 같은 프로세스로 복구 | 같은 대화나 프로젝트 밖에서 "다시 복습하자"를 하면 `get_learning_context`를 부르지 않는다(새 대화·튜터 프로젝트에서는 부름). DB 중지 중 `record_study_note` 실패 경로는 불리지 않아 확인하지 못함 |

## 2단계: 개념 검토와 경험 카드

**준비:** 배포(`ops/deploy.sh`) 뒤 Desktop 다시 시작. 도구 메뉴에 `list_pending_concepts`, `review_concept`, `list_pending_cases`, `review_case`, `search_experience`가 보인다.

### 개념 검토

- [ ] "승인 대기 개념 보여줘"라고 하면 `list_pending_concepts`를 부르고, 개념마다 카드 수와 카드 제목을 보여 준 뒤 무엇을 할지 묻는다
- [ ] 사용자가 답하지 않은 개념은 Claude가 스스로 승인·병합·거절하지 않는다
- [ ] "이름을 X로 고쳐서 승인", "Y랑 병합", "거절"이 각각 `review_concept`의 `APPROVE`(고칠 값 포함)·`MERGE`(`into`)·`REJECT`로 반영된다
  ```bash
  docker compose exec postgres psql -U growth growth \
    -c "SELECT name, status, auto_approved, aliases FROM concept WHERE origin = 'INGESTION' ORDER BY updated_at DESC LIMIT 10;"
  ```
- [ ] 승인한 개념을 주제로 꺼내면 `get_learning_context`의 관련 개념에 나온다

### 판단 사례 검토

- [ ] "판단 사례 검토하자"라고 하면 `list_pending_cases`를 부르고, 사례마다 걸린 이유와 원래 카드와 다른 곳을 보여 준 뒤 무엇을 할지 묻는다
- [ ] 사례마다 종류(경험 사례·가정 사례)가 보이고, 가정 사례는 "가정한 상황"이라고 밝혀 소개한다. 경험 사례가 PENDING이면 걸린 이유가 "경험 사례:"와 "가정 사례:"로 나뉘어 보인다
- [ ] Claude가 고칠 문장을 제안할 때 원래 카드에 없는 사실을 더하지 않는다. 사용자가 답하지 않은 사례는 바꾸지 않는다
- [ ] "제약 2번 빼고 승인", "거절, 정답이 하나로 안 정해짐"이 각각 `review_case`의 `APPROVE`(바꾼 필드)·`REJECT`(`note`)로 반영된다
  ```bash
  docker compose exec postgres psql -U growth growth \
    -c "SELECT id, experience_id, kind, status, left(review_note, 60) FROM decision_case ORDER BY updated_at DESC LIMIT 10;"
  ```

### 경험 카드 (2단계 완료 기준)

- [ ] 카드가 많은 개념으로 공부를 시작하면(예: "운영 중 스키마 변경 공부하자", "서버 캐시 공부하자") 설명 중에 내 경험 카드를 한두 문장으로 인용한다. 카드를 통째로 읽지 않는다
- [ ] "내가 겪은 인덱스 사고 사례 보여줘"처럼 경험을 찾으면 `search_experience`를 부르고 상황·행동·결과·교훈을 보여 준다
- [ ] 거절한 개념(프런트엔드 등)의 경험도 키워드로 찾으면 나온다(예: "keepPreviousData 겪었던 거")

### 기록

| 날짜 | 릴리스 | 결과 | 발견한 문제 |
|---|---|---|---|
| | | | |

## 3단계: 퀴즈 출제

복습·채점 도구(`get_review_set`, `submit_answer`)가 생기기 전에는 출제 품질을 `npm run quiz`로 보고, 출제 지침만 Desktop에서 고친다.

### 출제 품질 (`npm run quiz -- --concept <이름>`)

- [ ] 카드·학습 기록이 있는 개념 3~4개로 객관식·빈칸을 만들어 본다. 용어 정의가 아니라 왜·언제·트레이드오프·동작 원리를 묻는다
- [ ] 객관식 오답 보기가 그럴듯하고, 오개념이 그 보기를 고르는 틀린 믿음을 적었다. 학습 기록의 헷갈린 점이 있으면 그 지점을 겨냥한다
- [ ] 보기 길이로 정답을 짐작할 수 없고, 정답 위치가 고르게 섞인다
- [ ] (빈칸은 복습에서 뺐다, ADR-0033. 다시 넣으면 확인) 빈칸의 답이 하나로 정해지고, 다른 표기가 허용 답에 들어 있다
- [ ] 회사 이름·사내 테이블 같은 회사 맥락이 문제에 없다
- [ ] INVALID로 남은 문제의 걸린 이유(`validation_note`)가 납득된다

### 복습과 채점 (Desktop)

- [ ] "복습하자"에 `get_review_set`을 부르고 한 번에 한 문제씩, 객관식 보기는 줄바꿈 목록으로 낸다. 정답을 먼저 말하지 않는다
- [ ] 답하면 확신도를 묻고 `submit_answer`를 부른다. 결과의 해설·오개념으로 틀린 이유를 짚는다
- [ ] 풀에 문제가 없는 개념은 "만드는 중"으로 알리고, 1~2분 뒤 다시 부르면 새 문제가 나온다
- [ ] 기다리는 동안 Claude가 문제를 지어내 내지 않는다(지어낸 문제는 채점·기록되지 않는다). 만들기가 검증에 걸리면 "만들지 못함"으로 알린다
- [ ] "인덱스 문제 내줘"에 그 개념 문제만 낸다
- [ ] "이 문제 이상해"에 `report_question`을 부르고, 그 문제가 다시 나오지 않는다
- [ ] 하루 10문제를 풀면 더 내지 않는다
- [ ] 판단 사례가 있는 개념(예: 운영 중 스키마 변경)을 복습하면 상황 판단형 문제가 개념 문제 둘마다 하나씩 나온다(ADR-0033). 회사 이름·사내 테이블 없이 풀리고, 가정 사례 문제는 `[가정한 상황]`으로 시작한다
- [ ] 상황 판단형 채점 결과에 경험 사례면 "이 원칙을 실제로 겪은 경험", 가정 사례면 "같은 개념을 다룬 내 경험"이 나온다
- [ ] 틀린 문제의 개념을 다음에 복습하면, 같은 핵심을 다른 상황으로 묻는 변형 문제가 나오고 원래 문제를 외워서는 풀 수 없다

### 약점 (Desktop)

- [ ] 몇 문제를 일부러 틀린 뒤 "내 약점 뭐야"에 `get_weakness`를 부르고 트랙별 약점, 반복한 오개념, 근본 원인 후보(약점 둘 이상이 기대는 선수 개념, ADR-0033)를 보여 준다
- [ ] 근본 원인 후보가 있으면 다음 "복습하자"에서 그 개념 문제가 먼저 나온다

### 출제 지침 (Desktop)

- [ ] "앞으로 보기에 코드 조각은 넣지 마"라고 하면 `update_quiz_guideline`으로 규칙을 더하고 지금 지침을 보여 준다
- [ ] "출제 지침 보여줘"에 지침 목록을 보여 주고, "그 규칙 빼줘"에 목록의 문장 그대로 지운다

### 기록

| 날짜 | 릴리스 | 결과 | 발견한 문제 |
|---|---|---|---|
| | | | |

## 4단계: 원격 커넥터 (웹·모바일·아이패드)

Claude 앱에 커스텀 커넥터 `https://mcp.seok.app/mcp`를 붙여 확인한다(ADR-0035, 붙이는 법은 `docs/ops.md` "OAuth").

### 연결

- [x] claude.ai 웹에서 Add custom connector → 구글 로그인 → 동의 화면(클라이언트 이름, client_id URL, 돌아갈 호스트) → 허용 → 연결됨
- [x] 서버 로그에 `처음 보는 client_id`·`연결 허용`·`토큰 발급`과 도구 호출이 남는다
- [x] 모바일(아이폰·아이패드) Claude 앱에 같은 커넥터가 뜨고 도구가 불린다
- [ ] 1시간 뒤에도 다시 로그인 없이 도구가 불린다(액세스 토큰 갱신)

### 기록

| 날짜 | 릴리스 | 결과 | 발견한 문제 |
|---|---|---|---|
| 2026-10-20 | 20261020-021312 | 웹 연결(구글 로그인·동의·토큰·`get_review_set`), 모바일에서 도구 호출 확인. 맥미니 Desktop의 로컬 stdio 등록을 뺐다 | 없음 |
