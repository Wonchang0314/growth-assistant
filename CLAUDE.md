# growth-assistant

내 프로젝트·문제 해결 경험(Notion·velog)을 기억하고, 약점 보완과 다음 학습을 이끄는 개인 AI 어시스턴트. 첫 모듈은 Discord 기반 튜터(퀴즈·간격 반복·튜터링 대화·먼저 말 걸기). LLM은 Claude 구독(`claude -p` CLI)으로만 호출하고 API 키는 쓰지 않는다.

## 기술 스택

- Kotlin, Spring Boot, Gradle (Kotlin DSL), JDK 21
- PostgreSQL 16 (Docker), Spring Data JPA, Flyway
- Discord: JDA + jda-ktx, Kotlin Coroutines
- LLM: `claude` CLI 서브프로세스
- 테스트: JUnit5, MockK, Testcontainers
- 코드 스타일: ktlint (`build`에 포함)

## 패키지 구조

```
com.growthassistant
├── core                 # 여러 기능 모듈이 공유하는 기반
│   ├── discord          # JDA 설정, 이벤트 라우팅, 컴포넌트 ID 규칙
│   ├── llm              # ClaudeClient, ClaudeCliClient, 프롬프트, 호출 로그
│   ├── memory           # 원문 문서·청크, 경험 카드(STAR+L)
│   ├── knowledge        # 트랙, 개념 그래프
│   ├── ingestion        # Notion·velog 수집, 증분 동기화
│   ├── scheduler        # 예약 작업, 놓친 실행 복구
│   └── setting          # 실행 중 정해지는 키-값 설정 (app_setting)
└── tutor                # 튜터 기능 모듈
    ├── conversation     # 튜터링 대화(스레드 세션)
    ├── quiz             # 출제·검증·채점
    ├── mastery          # FSRS, 숙련도·약점
    └── outreach         # 아침 복습, 저녁 주제, 주간 리포트
```

기능 패키지 안에 도메인 모델(JPA 엔티티 겸용), Spring Data 저장소, 유스케이스를 두고, Discord 입력 어댑터는 그 기능의 `discord/` 하위 패키지에 둔다. 유스케이스는 JDA·프로세스 같은 외부 기술 타입을 모르고 `ClaudeClient` 같은 포트에만 의존한다 (ADR-0013).

## 명령

- 처음 한 번: `cp .env.example .env` 후 값 채우기
- DB 실행: `docker compose up -d`
- 빌드·테스트: `./gradlew build` (테스트 DB는 Testcontainers가 띄우므로 Docker만 실행 중이면 된다)
- 스타일 자동 수정: `./gradlew ktlintFormat`
- 실제 `claude` CLI 확인(구독 사용량 소모, 기본 건너뜀): `CLAUDE_LIVE=1 ./gradlew test --tests '*ClaudeCliLiveTest'`
- 실행: `./gradlew bootRun`

## 문서

- 진행 상태: `docs/roadmap.md`
- 기능 설계: `docs/specs/`
- 아키텍처(C4): `docs/architecture/`
- 결정 기록(ADR): `docs/adr/`

## 문서 갱신 규칙

코드를 고치면 Stop 훅(`.claude/hooks/`)이 종료 전에 문서 검토를 한 번 요구한다. 코드 파일은 Edit·Write로만 고친다(Bash로 고치면 훅이 기록하지 못한다).

| 바뀐 것 | 검토할 문서 |
|---|---|
| 패키지 추가·이동, 기술 스택·의존성, 빌드·실행 명령 | `CLAUDE.md`, `docs/architecture/c4-3-component.md` |
| 외부 연동, 실행 환경, 컨테이너 구성 | `docs/architecture/c4-2-container.md`, `c4-1-context.md` |
| 데이터 모델(Flyway), 흐름·정책·스케줄 | `docs/specs/` 설계 문서 |
| ADR 결정과 다른 선택 | 새 ADR 작성 후 기존 ADR 상태를 `대체됨`으로 (채택된 ADR 본문은 고치지 않음) |
| 단계 작업 완료 | `docs/roadmap.md` 체크와 현재 위치 |

문서가 지금 코드와 다른 내용을 말하고 있으면 고친다. 이름 변경이나 내부 리팩터처럼 문서에 드러나지 않는 변경이면 고치지 않는다.
