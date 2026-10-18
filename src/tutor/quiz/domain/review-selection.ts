/** 하루에 채점하는 문제 수의 상한 (설계 문서 2장, 리뷰 부채 방지). */
export const DAILY_LIMIT = 10;

/**
 * 복습할 개념을 우선순위대로 [limit]개 고른다 (설계 문서 7.3 "개념 선택 우선순위").
 * ① 복습할 때가 된 개념 → ② 헷갈렸다고 기록하고 아직 확인하지 않은 개념, 약점 개념 → ③ 새 개념(트랙 가중치로 뽑음).
 * 앞에서 고른 개념은 뒤에서 다시 고르지 않는다. [random]은 [0, 1) 난수다.
 */
export function pickConcepts(input: {
  readonly due: readonly number[];
  readonly confused: readonly number[];
  readonly weak: readonly number[];
  readonly fresh: readonly { readonly conceptId: number; readonly weight: number }[];
  readonly limit: number;
  readonly random: () => number;
}): number[] {
  const ordered = [...input.due, ...input.confused, ...input.weak, ...weightedOrder(input.fresh, input.random)];
  return [...new Set(ordered)].slice(0, input.limit);
}

/**
 * 가중치에 비례한 확률로 하나씩 뽑은 순서 (Efraimidis–Spirakis: 키 = 난수^(1/가중치)가 큰 것부터).
 * 가중치가 0인 트랙(예: 서술형을 기다리는 트랙)의 개념은 뽑지 않는다.
 */
function weightedOrder(
  items: readonly { readonly conceptId: number; readonly weight: number }[],
  random: () => number,
) {
  return items
    .filter((i) => i.weight > 0)
    .map((i) => ({ id: i.conceptId, key: random() ** (1 / i.weight) }))
    .sort((a, b) => b.key - a.key)
    .map((i) => i.id);
}
