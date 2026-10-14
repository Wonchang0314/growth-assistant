# ADR-0013: 기능별 패키지에 외부 경계만 포트·어댑터로 분리한다

- 상태: 대체됨(ADR-0015)
- 날짜: 2026-10-13

## 맥락

`core` / `tutor` 아래를 기능 단위로 나누기로 했다(설계 문서 4장). Discord 게이트웨이를 만들기 전에 기능 패키지 안의 구조와 의존 방향을 정해야 한다. 지금 코드는 이렇다.

- `ClaudeClient` 인터페이스가 있고 `ClaudeCliClient`(CLI)와 `FakeClaudeClient`(테스트)가 이를 구현한다.
- JPA 엔티티가 도메인 규칙을 갖는다(예: `ConversationSession.close()`).
- 저장소는 Spring Data 인터페이스다.

## 결정

**기능별 패키지**를 기본으로 하고, 외부 시스템과 닿는 경계에만 **포트와 어댑터**를 둔다.

```
tutor/conversation/
├── ConversationSession.kt   # 도메인 모델 겸 JPA 엔티티. 상태 변경은 메서드로만 한다
├── ConversationRepositories.kt  # Spring Data. 저장소 포트로 그대로 쓴다
├── StartSession.kt …        # 유스케이스. 기능의 입구
└── discord/                 # 입력 어댑터. JDA 이벤트를 DTO로 바꿔 유스케이스를 부른다
core/llm/
├── ClaudeClient.kt          # 출력 포트
└── ClaudeCliClient.kt …     # 출력 어댑터
```

- **포트·어댑터로 분리하는 곳:** Discord(입력), `claude` CLI(출력), `#관리` 알림 같은 Discord 출력. 바뀔 수 있거나 테스트에서 가짜로 바꿔야 하는 외부 시스템이다.
- **분리하지 않는 곳:** 도메인 모델과 JPA 엔티티, 저장소 포트와 Spring Data. 같은 클래스를 쓰고, DB는 Testcontainers로 실제 PostgreSQL을 써서 테스트한다.
- **의존 규칙**
  - 유스케이스와 도메인 모델은 JDA, 프로세스 실행, HTTP 클라이언트 같은 외부 기술 타입을 모른다.
  - 어댑터 패키지(`discord/` 등)는 유스케이스를 부르기만 하고, 유스케이스는 어댑터 패키지를 모른다.
  - `core`는 `tutor`를 모른다. `core.discord`는 공통 인터페이스(예: 슬래시 명령 처리기)를 정의하고, 기능 모듈의 어댑터가 그것을 구현해 빈으로 등록한다.

## 결과

- 좋은 점: 유스케이스를 Discord·CLI 없이 테스트할 수 있다. 기능 하나의 코드가 한 패키지에 모인다. 엔티티와 도메인 객체를 오가는 변환 코드가 없다.
- 나쁜 점·감수할 것: 도메인 모델이 JPA 어노테이션과 규칙(기본 생성자, 지연 로딩)에 묶인다. 저장 방식을 바꾸면 도메인 모델도 바뀐다. 의존 규칙은 컴파일러가 막지 않으므로 리뷰로 지킨다(필요해지면 ArchUnit 테스트를 추가한다).

## 검토한 대안

- 엄격한 헥사고날(`domain` / `application` / `adapter`, 도메인 객체와 JPA 엔티티 분리): 1인 프로젝트에서 변환 코드와 파일 수가 크게 늘어 얻는 것보다 비용이 크다.
- 계층별 패키지(`entity` / `repository` / `service`): 기능 하나를 고칠 때 여러 폴더를 오가야 하고, 유스케이스가 외부 기술 구현에 직접 의존하기 쉽다.
