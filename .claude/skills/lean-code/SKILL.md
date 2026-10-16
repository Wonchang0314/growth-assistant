---
name: lean-code
description: growth-assistant의 "적은 코드" 규칙. 중복을 없애고, 읽는 사람이 기억할 것을 줄이고, 같은 결과를 더 적은 코드로 만든다. 이 레포의 .ts 파일을 쓰거나 고치기 전에, 그리고 code-reviewer가 diff를 리뷰할 때 쓴다.
---

# lean-code — 적은 코드

좋은 코드는 같은 결과를 더 적은 코드로 만들고, 읽는 사람이 동시에 기억해야 할 것이 적은 코드다. 사실 하나는 한 곳에만 두고, 나머지는 거기서 끌어온다.

타입 규율(판별 유니온, `as` 금지, 경계에서 한 번 파싱)은 `seokit-frontend:typescript-best-practice`를 따른다. 삭제 우선(R4), 미래용 코드 금지(R5), 한 가지 방법(R10), 있는 걸 쓴다(R11), 손으로 맞추는 목록 금지(R13)는 `seokit-frontend:code-rules`를 따른다. 여기에는 그 둘에 없는 것만 적는다.

규칙 ID는 리뷰에서 그대로 인용한다(예: `L1 타입은 원천에서`).

| ID | 규칙 | 요약 |
|---|---|---|
| L1 | 타입은 원천에서 | 타입을 손으로 다시 적지 않는다. Drizzle 테이블은 `$inferSelect`·`$inferInsert`, 값 목록은 `as const` 배열의 `(typeof X)[number]`, zod 스키마는 `z.infer`에서 끌어오고 `Pick`·`Omit`으로 좁힌다. 원천에 없는 필드가 필요할 때만 새 타입을 선언한다. |
| L2 | 두 번째에 합친다 | 같은 의미의 로직이 두 번째로 나오면 그것이 속한 모듈로 옮겨 하나로 쓴다(R6의 "중복 세 줄 허용"을 대신함). 모양만 같고 바뀌는 이유가 다른 코드는 합치지 않는다. |
| L3 | 플랫폼이 하는 일은 맡긴다 | Node 24 내장(`Object.groupBy`, `Map`, `structuredClone`, `node:util` `parseArgs`), Drizzle 쿼리 빌더·`onConflictDoUpdate`, zod `transform`·`default`가 하는 일을 직접 짜지 않는다. |
| L4 | 기억할 것을 줄인다 | 코드 양은 줄 수가 아니라 읽는 사람이 동시에 들고 있어야 할 것(변수, 분기, 건너뛰는 파일)의 수로 잰다. 중첩 삼항, 이름 없는 긴 체인처럼 줄만 줄이는 코드는 위반이다. 조기 반환으로 중첩을 펴고, 이름이 뜻을 더할 때만 중간 변수를 둔다. |
| L5 | 테스트도 같다 | 같은 모양의 케이스는 `it.each`로 묶는다. 여러 테스트가 쓰는 준비 코드와 가짜 구현은 `test/`에 하나만 둔다. 다만 각 테스트에서 무엇을 검사하는지는 그 테스트 안에서 보여야 한다. |

예시: [`references/patterns.md`](references/patterns.md).
