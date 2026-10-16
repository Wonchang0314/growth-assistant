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

### 오류

- [ ] `docker compose stop postgres` 뒤 학습 주제를 꺼내면, Claude가 DB 연결 실패(`ECONNREFUSED`)로 도구를 쓰지 못했다고 알려 준다. 서버는 계속 running이다. 확인 뒤 `docker compose start postgres`

### 기록

| 날짜 | 릴리스 | 결과 | 발견한 문제 |
|---|---|---|---|
| | | | |
