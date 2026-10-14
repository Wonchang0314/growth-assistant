# ADR-0001: Kotlin + Spring Boot 독립 프로젝트로 만든다

- 상태: 대체됨(ADR-0014)
- 날짜: 2026-10-12

## 맥락

참고한 `JSL107/personal_agents`는 NestJS 기반 멀티 에이전트 시스템이다. 그러나 남의 프로젝트이고 구조 참고용일 뿐이다. 사용자의 학습 목표에는 Kotlin·Spring·DB 이해도를 높이는 것이 포함되어 있다.

## 결정

새 레포에서 Kotlin + Spring Boot(Gradle Kotlin DSL)로 만든다. 모듈러 모놀리스로 구성하고, 패키지는 `core`와 기능 모듈(`tutor`)로 나눈다.

## 결과

- 좋은 점: 만드는 과정 자체가 백엔드 학습이고 포트폴리오가 된다. DI, 트랜잭션, 스케줄러를 한 프로세스에서 다룬다.
- 나쁜 점: TypeScript보다 초기 구현 속도가 느리다. Discord 관련 자료가 Node보다 적다.

## 검토한 대안

- 참고 레포에 에이전트를 추가: 남의 프로젝트라 제외했다.
- TypeScript(discord.js), Python(discord.py): 구현은 빠르지만 학습 목표와 맞지 않는다.
