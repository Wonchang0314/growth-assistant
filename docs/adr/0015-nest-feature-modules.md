# ADR-0015: 기능별 Nest 모듈에 외부 경계만 포트·어댑터로 분리하고, 도메인 규칙은 저장 형식과 떼어 둔다

- 상태: 일부 대체됨(ADR-0017·0018: Discord 처리기 모으기)
- 날짜: 2026-10-14

## 맥락

ADR-0013은 기능별 패키지와 외부 경계의 포트·어댑터를 정하면서, JPA 엔티티를 도메인 모델로 함께 쓰기로 했다. NestJS + Drizzle로 바꾸면서(ADR-0014) 두 가지가 달라진다.

- Drizzle의 조회 결과는 일반 객체다. `ConversationSession.close()`처럼 엔티티에 상태 변경 메서드를 둘 수 없다.
- Spring의 `List<SlashCommandHandler>` 주입 같은 "구현체 모으기"를 Nest에서는 다른 방식으로 해야 한다.

## 결정

ADR-0013의 원칙(기능별로 모으고, 바뀔 수 있거나 테스트에서 가짜로 바꿔야 하는 외부 시스템만 포트·어댑터로 나눈다)은 유지하고, Nest에서는 다음처럼 구현한다.

```
src/tutor/conversation/
├── conversation.module.ts
├── session.ts                # 도메인 타입과 규칙(순수 함수). 상태 변경은 여기 함수로만 한다
├── conversation.schema.ts    # 이 기능의 Drizzle 테이블 정의
├── conversation.repository.ts  # Drizzle 쿼리. 행 ↔ 도메인 타입 변환
├── conversation.service.ts   # 유스케이스
└── discord/                  # 입력 어댑터. discord.js 이벤트를 값으로 바꿔 유스케이스를 부른다
src/core/llm/
├── claude.client.ts          # 출력 포트 (추상 클래스, Nest 주입 토큰 겸용)
└── claude-cli.client.ts …    # 출력 어댑터
src/core/db/
├── db.module.ts              # 연결, 시작 시 마이그레이션, DB 주입 토큰
└── migrations/               # drizzle-kit이 src/**/*.schema.ts를 모아 만든 SQL
```

- **도메인 규칙:** 상태 변경은 `closeSession(session, summary, at)`처럼 새 값을 돌려주는 순수 함수로 둔다. 불가능한 상태 전이는 타입으로 막는다(예: 세션을 `ActiveSession | ClosedSession` 유니온으로 두고 `closeSession`은 `ActiveSession`만 받아, 닫힌 세션을 다시 닫는 코드는 컴파일되지 않는다). 단위 테스트는 DB 없이 이 함수를 검사한다.
- **테이블 정의:** 각 기능 모듈이 자기 테이블을 `*.schema.ts`에 정의한다. `core/db`는 특정 기능의 테이블을 모른다.
- **저장소:** 기능 모듈 안의 클래스로 Drizzle을 직접 쓴다. 저장소 인터페이스를 따로 두지 않고, Testcontainers로 실제 PostgreSQL에서 테스트한다.
- **포트:** 외부 시스템 경계(`ClaudeClient`, `#관리` 알림 등)는 추상 클래스를 주입 토큰으로 쓰고, 테스트에서는 가짜 구현으로 바꾼다.
- **처리기 모으기:** `core/discord`가 `@SlashCommand()`·`@GuildMessageHandler()` 같은 데코레이터를 정의하고, 게이트웨이가 Nest `DiscoveryService`로 찾아 등록한다. 기능 모듈은 데코레이터를 붙인 provider를 등록하기만 한다.
- **의존 규칙:** ADR-0013과 같다. 유스케이스와 도메인은 discord.js, `child_process` 같은 외부 기술 타입을 모른다. 어댑터는 유스케이스를 부르기만 한다. `core`는 `tutor`를 모른다. 규칙은 ESLint `no-restricted-imports`로 강제한다.

## 결과

- 좋은 점: 도메인 규칙이 프레임워크·ORM과 무관한 순수 함수라 테스트와 읽기가 쉽다. 데코레이터로 처리기를 등록해 게이트웨이가 기능 모듈을 몰라도 된다. 의존 규칙을 리뷰가 아니라 린트로 지킨다.
- 나쁜 점·감수할 것: 저장소에서 행과 도메인 타입을 오가는 변환 코드가 생긴다. 도메인 규칙을 거치지 않고 저장소로 직접 값을 바꾸는 실수는 컴파일러가 막지 않는다.

## 검토한 대안

- 엔티티 클래스에 메서드를 두고 저장소가 클래스 인스턴스로 감싸기: 변환 코드가 거의 같고, 가변 객체라 상태 추적이 더 어렵다.
- 저장소 인터페이스 분리 + 메모리 구현으로 테스트: 실제 SQL 동작(제약 조건, 정렬)을 확인하지 못한다.
- 처리기 목록을 직접 배열로 주입: 새 처리기를 추가할 때마다 게이트웨이 모듈을 고쳐야 한다.
