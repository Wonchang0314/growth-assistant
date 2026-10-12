# growth-assistant

내 프로젝트·문제 해결 경험(Notion·velog)을 기억하고, 약점 보완과 다음 학습을 이끄는 개인 AI 어시스턴트. 첫 모듈은 Discord 기반 튜터(퀴즈·간격 반복·튜터링 대화·먼저 말 걸기). LLM은 Claude 구독(`claude -p` CLI)으로만 호출하고 API 키는 쓰지 않는다.

## 기술 스택

- Kotlin, Spring Boot, Gradle (Kotlin DSL), JDK 21
- PostgreSQL 16 (Docker), Spring Data JPA, Flyway
- Discord: JDA + jda-ktx, Kotlin Coroutines
- LLM: `claude` CLI 서브프로세스
- 테스트: JUnit5, MockK, Testcontainers

## 패키지 구조

```
com.growthassistant
├── core                 # 여러 기능 모듈이 공유하는 기반
│   ├── discord          # JDA 설정, 이벤트 라우팅, 컴포넌트 ID 규칙
│   ├── llm              # ClaudeClient, ClaudeCliClient, 프롬프트, 호출 로그
│   ├── memory           # 원문 문서·청크, 경험 카드(STAR+L)
│   ├── knowledge        # 트랙, 개념 그래프
│   ├── ingestion        # Notion·velog 수집, 증분 동기화
│   └── scheduler        # 예약 작업, 놓친 실행 복구
└── tutor                # 튜터 기능 모듈
    ├── conversation     # 튜터링 대화(스레드 세션)
    ├── quiz             # 출제·검증·채점
    ├── mastery          # FSRS, 숙련도·약점
    └── outreach         # 아침 복습, 저녁 주제, 주간 리포트
```

## 명령

- DB 실행: `docker compose up -d`
- 빌드·테스트: `./gradlew build`
- 실행: `./gradlew bootRun`

## 문서

- 진행 상태: `docs/roadmap.md`
- 기능 설계: `docs/specs/`
- 아키텍처(C4): `docs/architecture/`
- 결정 기록(ADR): `docs/adr/`
