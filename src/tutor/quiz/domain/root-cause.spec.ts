import { describe, expect, it } from 'vitest';
import { type PrerequisiteLevel, rootCauses } from './root-cause.js';

const c = (id: number) => ({ id, name: `개념${id}` });

describe('rootCauses', () => {
  it('약점 개념의 선수 개념 중 약하거나 확인하지 않은 것을, 그 개념이 필요한 약점 개념이 많은 것부터 고른다', () => {
    // 1·2가 약점. 1 ← 10·11, 2 ← 10·12·13. 11은 양호.
    const prerequisites = new Map([
      [1, [c(10), c(11)]],
      [2, [c(12), c(10), c(13)]],
    ]);
    const levels = new Map<number, PrerequisiteLevel>([
      [10, 'UNMEASURED'],
      [11, 'OK'],
      [12, 'WEAK'],
    ]);

    const causes = rootCauses({ weak: [c(1), c(2)], prerequisites, levels });

    expect(causes.map((r) => [r.concept.id, r.level, r.dependents.map((d) => d.id)])).toEqual([
      [10, 'UNMEASURED', [1, 2]],
      [12, 'WEAK', [2]],
      [13, 'UNSTUDIED', [2]],
    ]);
  });

  it('약점 개념이 다른 약점 개념의 선수 개념이면 그것도 후보다', () => {
    const causes = rootCauses({
      weak: [c(1), c(2)],
      prerequisites: new Map([[2, [c(1)]]]),
      levels: new Map([[1, 'WEAK']]),
    });

    expect(causes).toEqual([{ concept: c(1), level: 'WEAK', dependents: [c(2)] }]);
  });
});
