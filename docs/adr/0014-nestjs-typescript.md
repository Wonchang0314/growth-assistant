# ADR-0014: NestJS + TypeScript로 전환한다

- 상태: 일부 대체됨(ADR-0017·0018: Discord, HTTP 서버 없이 실행, ADR-0035: MCP HTTP 진입점은 Nest HTTP 앱)
- 날짜: 2026-10-14

## 맥락

ADR-0001은 Kotlin·Spring 학습을 목표로 Kotlin + Spring Boot를 골랐다. 1단계 MVP(대화, `ClaudeClient`, Discord 게이트웨이)를 만들고 보니 Kotlin 문법·관용구에 익숙하지 않아 코드베이스 전체를 이해하기 어려웠다. 코드를 이해하지 못하면 백엔드를 배운다는 목표도 이루기 어렵다.

사용자는 프론트엔드에서 TypeScript를 써 왔다. 아는 언어로 진행하면 언어 문법이 아니라 백엔드 개념(DI, 트랜잭션, 마이그레이션, 동시성, 프로세스 관리)에 집중할 수 있다. 장기 방향인 풀스택과도 맞는다.

지금이 바꾸기 가장 싼 시점이다. 코드는 본문 약 1,200줄, 테스트 약 1,000줄이고, 운영(Mac mini)을 시작하기 전이라 옮길 데이터가 없다.

## 결정

Kotlin + Spring Boot 코드를 NestJS + TypeScript로 다시 작성한다. 기능과 DB 스키마는 그대로 두고, 기존 테스트를 하나씩 옮겨 같은 동작을 확인한다.

| 영역 | 선택 |
|---|---|
| 런타임·언어 | Node.js 24 LTS, TypeScript 6.0 `strict`, ESM. TypeScript 7(네이티브)은 typescript-eslint가 아직 지원하지 않아 쓰지 않는다 |
| 프레임워크 | NestJS 12 (ESM 전용). HTTP 서버 없이 애플리케이션 컨텍스트만 띄운다 |
| Discord | discord.js v14. 개인 서버·채널 구성(`#복습-퀴즈` `#튜터` `#리포트` `#개념-관리` `#관리`)과 지연 응답·토큰 만료 대응은 ADR-0003 그대로 |
| DB 접근 | Drizzle ORM, 마이그레이션은 drizzle-kit이 만든 SQL 파일. Flyway V1·V2는 baseline 마이그레이션 하나로 합친다 |
| 설정·검증 | `@nestjs/config` + zod. LLM 구조화 출력도 zod로 검증하고, `--json-schema`에 넘길 스키마는 zod 스키마에서 만든다 |
| 예약 작업 | `@nestjs/schedule` |
| 테스트 | Vitest 5, `@testcontainers/postgresql`. Vitest 5의 변환기(Vite 8, Oxc)가 tsconfig의 데코레이터 메타데이터 설정을 읽으므로 `unplugin-swc`는 필요 없다 |
| 코드 스타일 | ESLint(typescript-eslint) + Prettier |
| 로그 | pino, 운영 프로필은 파일 회전 |

모듈 구조와 의존 규칙은 ADR-0015를 따른다. 다른 ADR에 쓰인 "Kotlin 코드", "Kotlin DTO" 같은 표현은 TypeScript 코드, zod 스키마로 읽는다(결정 내용은 바뀌지 않는다).

## 결과

- 좋은 점
  - 언어 장벽 없이 코드 전체를 읽고 고칠 수 있다. 백엔드 개념 학습에 집중한다.
  - 프론트엔드와 같은 언어·도구(Vitest, ESLint)를 쓴다. Discord 자료는 Node 쪽이 가장 많다.
  - Drizzle은 SQL 모양을 그대로 드러내 SQL 학습에도 도움이 된다.
- 나쁜 점·감수할 것
  - 2~4단계 기능 개발이 전환 기간만큼 늦어진다.
  - Discord ID(snowflake)는 JS `number` 범위를 넘으므로 DB `bigint`와 코드 사이를 `bigint`/문자열로 다뤄야 한다.
  - Node는 단일 스레드지만 `await` 사이에 작업이 끼어들므로, 세션별 잠금과 LLM 동시 실행 제한은 그대로 필요하다.
  - Drizzle 행은 일반 객체라 엔티티에 도메인 메서드를 둘 수 없다 (ADR-0015).
  - 처리하지 않은 Promise 거부가 프로세스를 끝낼 수 있어 이벤트 진입점에서 예외를 모두 잡아야 한다.

## 검토한 대안

- Kotlin 유지 + 언어 학습 병행: 언어와 백엔드 개념을 동시에 배우느라 진행이 더디다.
- Express·Fastify만 사용: DI·모듈·스케줄러를 직접 조립해야 한다. NestJS는 지금 구조(기능 모듈, 생성자 주입)와 가장 비슷하다.
- ORM: Prisma(별도 스키마 언어, 복잡한 쿼리는 원시 SQL로 빠짐), Kysely(ORM이 아니라 세팅 부담이 큼), TypeORM(타입 안전성 약함), MikroORM(JPA식 복잡도를 다시 들임).
- 테스트: Jest(Nest 기본값이지만 ESM 전용 패키지 지원이 불편하고 `ts-jest`가 느림).
