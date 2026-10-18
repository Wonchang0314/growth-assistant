import type { ConceptRef } from '../../../core/knowledge/concept.js';
import type { WeaknessLevel } from '../../mastery/mastery.js';

/** 선수 개념의 상태. 일정이 없으면(대화·퀴즈에서 다룬 적 없음) UNSTUDIED다. */
export type PrerequisiteLevel = WeaknessLevel | 'UNSTUDIED';

export interface RootCause {
  readonly concept: ConceptRef;
  readonly level: Exclude<PrerequisiteLevel, 'OK'>;
  /** 이 개념을 먼저 알아야 하는 약점 개념. */
  readonly dependents: readonly ConceptRef[];
}

const LEVEL_ORDER = { WEAK: 0, UNMEASURED: 1, UNSTUDIED: 2 } as const;

/**
 * 근본 원인 후보 (설계 문서 8장). 약점 개념의 선수 개념을 거슬러 올라가, 그 자신도 약하거나 아직 확인하지 않은 개념을 고른다.
 * 그 개념을 먼저 알아야 하는 약점 개념이 많은 것부터, 같으면 약점 → 미측정 → 다룬 적 없음 순이다.
 */
export function rootCauses(input: {
  readonly weak: readonly ConceptRef[];
  /** 약점 개념 id → 선수 개념(가까운 것부터). */
  readonly prerequisites: ReadonlyMap<number, readonly ConceptRef[]>;
  readonly levels: ReadonlyMap<number, PrerequisiteLevel>;
}): RootCause[] {
  const candidates = new Map<number, { concept: ConceptRef; dependents: ConceptRef[] }>();
  for (const weak of input.weak) {
    for (const prerequisite of input.prerequisites.get(weak.id) ?? []) {
      const entry = candidates.get(prerequisite.id) ?? { concept: prerequisite, dependents: [] };
      entry.dependents.push(weak);
      candidates.set(prerequisite.id, entry);
    }
  }
  return [...candidates.values()]
    .flatMap(({ concept, dependents }) => {
      const level = input.levels.get(concept.id) ?? 'UNSTUDIED';
      return level === 'OK' ? [] : [{ concept, level, dependents }];
    })
    .sort(
      (a, b) =>
        b.dependents.length - a.dependents.length ||
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
        a.concept.id - b.concept.id,
    );
}
