import { describe, expect, it } from 'vitest';
import { type PrerequisiteLevel, rootCauses } from './root-cause.js';

const c = (id: number) => ({ id, name: `개념${id}` });

describe('rootCauses', () => {
  it('약점 개념 둘 이상이 기대는 선수 개념 중 약하거나 확인하지 않은 것을, 기대는 약점 개념이 많은 것부터 고른다', () => {
    // 1·2·3이 약점. 10 ← 1·2·3, 11 ← 1·2(양호), 12 ← 2·3, 13 ← 2 하나뿐.
    const prerequisites = new Map([
      [1, [c(10), c(11)]],
      [2, [c(12), c(10), c(11), c(13)]],
      [3, [c(10), c(12)]],
    ]);
    const levels = new Map<number, PrerequisiteLevel>([
      [10, 'UNMEASURED'],
      [11, 'OK'],
      [12, 'WEAK'],
    ]);

    const causes = rootCauses({ weak: [c(1), c(2), c(3)], prerequisites, levels });

    expect(causes.map((r) => [r.concept.id, r.level, r.dependents.map((d) => d.id)])).toEqual([
      [10, 'UNMEASURED', [1, 2, 3]],
      [12, 'WEAK', [2, 3]],
    ]);
  });

  it('약점 개념이 다른 약점 개념 둘의 선수 개념이면 그것도 후보다', () => {
    const causes = rootCauses({
      weak: [c(1), c(2), c(3)],
      prerequisites: new Map([
        [2, [c(1)]],
        [3, [c(1)]],
      ]),
      levels: new Map([[1, 'WEAK']]),
    });

    expect(causes).toEqual([{ concept: c(1), level: 'WEAK', dependents: [c(2), c(3)] }]);
  });
});
