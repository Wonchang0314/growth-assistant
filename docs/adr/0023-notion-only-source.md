# ADR-0023: 기억의 원천은 Notion 하나로 하고 velog 수집은 하지 않는다

- 상태: 채택
- 날짜: 2026-10-17
- ADR-0006의 출처 결정(Notion과 velog)을 대체한다. 1회 백필, 청크 단위 증분 동기화, `Source` 인터페이스는 그대로다.

## 맥락

ADR-0006은 Notion과 velog를 기억의 원천으로 정했다. 2단계 수집을 시작하기 전에 사용자가 기억의 원천을 Notion 하나로 하기로 정했다. velog는 비공식 GraphQL API라 형식이 바뀌면 수집이 깨질 수 있다는 위험도 함께 안고 있었다.

## 결정

- 기억의 원천은 Notion 하나다. velog 수집기(`VelogSource`)는 만들지 않는다.
- 수집기는 계속 `Source` 인터페이스로 추상화한다. 다른 원천이 필요해지면 구현을 더하고 새 ADR을 쓴다.
- `source_document.source`는 `NOTION` 하나로 시작한다.

## 결과

- 좋은 점: 2단계 범위가 줄어든다. 비공식 API 실패를 처리하고 알리는 부분이 필요 없다. 청크 규칙이 Notion 블록 하나다.
- 나쁜 점·감수할 것: velog에만 남은 경험은 수집되지 않는다. 필요하면 Notion으로 옮기거나, 대화에서 경험 카드(`origin = CONVERSATION`)로 남긴다.

## 검토한 대안

- Notion과 velog 둘 다 수집(ADR-0006): 사용자가 Notion만 쓰기로 정했다.
