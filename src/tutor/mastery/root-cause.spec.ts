import { describe, expect, it } from 'vitest';
import { type PrerequisiteLevel, rootCauses, weakPrerequisites } from './root-cause.js';

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

describe('weakPrerequisites', () => {
  it('양호한 선수 개념은 빼고, 근본 원인 후보를 후보 순서대로 앞에 두며, 이 개념의 선수 개념이 아닌 후보는 더하지 않는다', () => {
    // 가까운 것부터 10(미측정), 11(양호), 12(근본 원인 2순위), 13(다룬 적 없음), 14(근본 원인 1순위). 99는 다른 개념의 후보.
    const levels = new Map<number, PrerequisiteLevel>([
      [10, 'UNMEASURED'],
      [11, 'OK'],
      [12, 'WEAK'],
    ]);
    const causes = [
      { concept: c(14), level: 'UNSTUDIED', dependents: [c(1), c(2), c(3)] },
      { concept: c(99), level: 'WEAK', dependents: [c(1), c(2), c(3)] },
      { concept: c(12), level: 'WEAK', dependents: [c(1), c(2)] },
    ] as const;

    const weak = weakPrerequisites([c(10), c(11), c(12), c(13), c(14)], levels, causes);

    expect(weak.map((w) => [w.concept.id, w.level, w.dependents.length])).toEqual([
      [14, 'UNSTUDIED', 3],
      [12, 'WEAK', 2],
      [10, 'UNMEASURED', 0],
      [13, 'UNSTUDIED', 0],
    ]);
  });
});
