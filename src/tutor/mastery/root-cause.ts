import type { ConceptRef } from '../../core/knowledge/concept.js';
import type { WeaknessLevel } from './mastery.js';

/** 선수 개념의 상태. 일정이 없으면(대화·퀴즈에서 다룬 적 없음) UNSTUDIED다. */
export type PrerequisiteLevel = WeaknessLevel | 'UNSTUDIED';

export const PREREQUISITE_LEVEL_TEXT = { WEAK: '약점', UNMEASURED: '미측정', UNSTUDIED: '다룬 적 없음' } as const;

/** 일정이 있는 개념의 상태([levels]) → 선수 개념의 상태. */
const levelOf = (levels: ReadonlyMap<number, PrerequisiteLevel>, id: number) => levels.get(id) ?? 'UNSTUDIED';

export interface RootCause {
  readonly concept: ConceptRef;
  readonly level: Exclude<PrerequisiteLevel, 'OK'>;
  /** 이 개념을 먼저 알아야 하는 약점 개념. */
  readonly dependents: readonly ConceptRef[];
}

const LEVEL_ORDER = { WEAK: 0, UNMEASURED: 1, UNSTUDIED: 2 } as const;
/** 근본 원인은 여러 약점의 공통 원인이다. 약점 하나만 기대는 선수 개념은 고르지 않는다 (사용자 결정 2026-10-18, ADR-0033). */
const MIN_DEPENDENTS = 2;

/**
 * 근본 원인 후보 (설계 문서 8장). 약점 개념의 선수 개념을 거슬러 올라가, 약점 개념 [MIN_DEPENDENTS]개 이상이 기대고
 * 그 자신도 약하거나 아직 확인하지 않은 개념을 고른다.
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
      const level = levelOf(input.levels, concept.id);
      return level === 'OK' || dependents.length < MIN_DEPENDENTS ? [] : [{ concept, level, dependents }];
    })
    .sort(
      (a, b) =>
        b.dependents.length - a.dependents.length ||
        LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
        a.concept.id - b.concept.id,
    );
}

/** 약점·미측정·다룬 적 없음인 선수 개념. [dependents]가 비어 있지 않으면 근본 원인 후보다. */
export type WeakPrerequisite = RootCause;

/**
 * 개념 하나의 선수 개념 중 약하거나 아직 확인하지 않은 것 (학습 맥락, 사용자 결정 2026-11-27).
 * 근본 원인 후보([causes])는 후보 순서대로 앞에 두고, 나머지는 가까운 선수 개념부터 둔다.
 * 이 개념의 선수 개념이 아닌 근본 원인 후보는 더하지 않는다.
 */
export function weakPrerequisites(
  prerequisites: readonly ConceptRef[],
  levels: ReadonlyMap<number, PrerequisiteLevel>,
  causes: readonly RootCause[],
): WeakPrerequisite[] {
  const rank = new Map(causes.map((c, i) => [c.concept.id, i]));
  const dependents = new Map(causes.map((c) => [c.concept.id, c.dependents]));
  return prerequisites
    .flatMap((concept) => {
      const level = levelOf(levels, concept.id);
      return level === 'OK' ? [] : [{ concept, level, dependents: dependents.get(concept.id) ?? [] }];
    })
    .sort((a, b) => (rank.get(a.concept.id) ?? causes.length) - (rank.get(b.concept.id) ?? causes.length));
}
