import { describe, expect, it } from 'vitest';
import { pickConcepts } from './review-selection.js';

const pick = (overrides: Partial<Parameters<typeof pickConcepts>[0]>) =>
  pickConcepts({ due: [], confused: [], weak: [], fresh: [], limit: 10, random: () => 0.5, ...overrides });

describe('pickConcepts', () => {
  it('복습할 때가 된 개념 → 헷갈린 개념 → 약점 → 새 개념 순으로, 겹치면 한 번만 고른다', () => {
    expect(
      pick({ due: [1, 2], confused: [3, 1], weak: [4, 3], fresh: [{ conceptId: 5, weight: 1 }], limit: 4 }),
    ).toEqual([1, 2, 3, 4]);
  });

  it('새 개념은 가중치에 비례해 뽑고, 가중치 0인 트랙은 뽑지 않는다', () => {
    const keys = [0.5, 0.5, 0.5];
    const fresh = [
      { conceptId: 1, weight: 0.1 },
      { conceptId: 2, weight: 0.9 },
      { conceptId: 3, weight: 0 },
    ];

    // 같은 난수면 가중치가 큰 쪽의 키(0.5^(1/w))가 크다.
    expect(pick({ fresh, random: () => keys.shift() ?? 0 })).toEqual([2, 1]);
  });
});
