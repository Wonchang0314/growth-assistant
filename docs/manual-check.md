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

**준비:** 배포(`ops/deploy.sh`) 뒤 Desktop 다시 시작. 도구 메뉴에 `list_pending_concepts`, `review_concept`, `search_experience`가 보인다.

### 개념 검토

- [ ] "승인 대기 개념 보여줘"라고 하면 `list_pending_concepts`를 부르고, 개념마다 카드 수와 카드 제목을 보여 준 뒤 무엇을 할지 묻는다
- [ ] 사용자가 답하지 않은 개념은 Claude가 스스로 승인·병합·거절하지 않는다
- [ ] "이름을 X로 고쳐서 승인", "Y랑 병합", "거절"이 각각 `review_concept`의 `APPROVE`(고칠 값 포함)·`MERGE`(`into`)·`REJECT`로 반영된다
  ```bash
  docker compose exec postgres psql -U growth growth \
    -c "SELECT name, status, auto_approved, aliases FROM concept WHERE origin = 'INGESTION' ORDER BY updated_at DESC LIMIT 10;"
  ```
- [ ] 승인한 개념을 주제로 꺼내면 `get_learning_context`의 관련 개념에 나온다

### 경험 카드 (2단계 완료 기준)

- [ ] 카드가 많은 개념으로 공부를 시작하면(예: "운영 중 스키마 변경 공부하자", "서버 캐시 공부하자") 설명 중에 내 경험 카드를 한두 문장으로 인용한다. 카드를 통째로 읽지 않는다
- [ ] "내가 겪은 인덱스 사고 사례 보여줘"처럼 경험을 찾으면 `search_experience`를 부르고 상황·행동·결과·교훈을 보여 준다
- [ ] 거절한 개념(프런트엔드 등)의 경험도 키워드로 찾으면 나온다(예: "keepPreviousData 겪었던 거")

### 기록

| 날짜 | 릴리스 | 결과 | 발견한 문제 |
|---|---|---|---|
| | | | |
