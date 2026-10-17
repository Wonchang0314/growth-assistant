import { z } from 'zod';
import { type ConceptOrigin, type ConceptStatus, type ConceptTerms, normalizeTerm, resolveConcept } from './concept.js';

/** 추출할 때 Claude가 개념 목록에 없어 새로 제안한 개념 (설계 문서 6장). */
export const conceptProposalSchema = z.object({
  name: z.string().min(1).describe('새 개념 이름. 강의 한 편보다 작은 크기'),
  track: z.string().describe('트랙 키. 목록에 있는 키 중 하나'),
  parent: z.string().nullable().describe('이 개념이 속하는 상위 개념 이름(개념 목록에 있는 이름). 없으면 null'),
  description: z.string().describe('한두 문장 설명'),
  aliases: z.array(z.string()).describe('영문 이름, 약어 같은 다른 표기'),
  confident: z.boolean().describe('상위 개념의 하위로 두는 것이 분명하고, 독립된 개념으로 다룰 만하다고 확신하면 true'),
});
export type ConceptProposal = z.infer<typeof conceptProposalSchema>;

/** 제안·검토할 때 비교하는 개념 어휘. 거절된 개념도 담아 다시 만들지 않게 한다. */
export interface Vocabulary {
  readonly tracks: readonly string[];
  readonly concepts: readonly VocabularyConcept[];
}

export type VocabularyConcept = ConceptTerms & {
  readonly status: ConceptStatus;
  readonly origin: ConceptOrigin;
  readonly track: string;
};

export interface NewConcept {
  readonly name: string;
  readonly track: string;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly status: Extract<ConceptStatus, 'ACTIVE' | 'PROPOSED'>;
  readonly autoApproved: boolean;
  /** PART_OF 상위 개념. */
  readonly parentId: number | null;
}

export interface ConceptPlan {
  readonly newConcepts: readonly NewConcept[];
  /** 기존 개념과 같은 제안에서 나온 다른 표기. */
  readonly aliasAdds: readonly { readonly conceptId: number; readonly alias: string }[];
  /** 개념 이름을 기존 개념 id나 새 개념 이름으로 바꾼다. 거절된 개념이나 모르는 이름이면 undefined. */
  resolve(name: string): number | string | undefined;
}

/**
 * 새 개념 제안에 승인 정책을 적용한다 (ADR-0007, 설계 문서 6장).
 * - 이름이나 별칭이 기존 개념과 같으면(정규화 기준) 새로 만들지 않고, 다른 표기를 별칭으로 더한다. 거절된 개념은 되살리지 않는다.
 * - 승인된 개념의 하위이고 Claude가 확신하면 자동 승인한다. 나머지는 승인 대기로 둔다.
 * - 모르는 트랙이면 상위 개념의 트랙을 쓰고, 그것도 없으면 버린다.
 */
export function planConcepts(vocabulary: Vocabulary, proposals: readonly ConceptProposal[]): ConceptPlan {
  const { concepts } = vocabulary;
  const newConcepts: NewConcept[] = [];
  const aliasAdds: { conceptId: number; alias: string }[] = [];
  const newTerms = () => newConcepts.map((c, id) => ({ id, name: c.name, aliases: c.aliases }));

  for (const p of proposals) {
    const existing = [p.name, ...p.aliases].map((term) => resolveConcept(term, concepts)).find((c) => c !== undefined);
    if (existing) {
      const known = existing.status === 'REJECTED' || resolveConcept(p.name, [existing]) !== undefined;
      const added = aliasAdds.some(
        (a) => a.conceptId === existing.id && normalizeTerm(a.alias) === normalizeTerm(p.name),
      );
      if (!known && !added) aliasAdds.push({ conceptId: existing.id, alias: p.name });
      continue;
    }
    if (resolveConcept(p.name, newTerms())) continue;

    const found = p.parent === null ? undefined : resolveConcept(p.parent, concepts);
    const parent = found?.status === 'REJECTED' ? undefined : found;
    const track = vocabulary.tracks.includes(p.track) ? p.track : parent?.track;
    if (track === undefined) continue;
    const autoApproved = p.confident && parent?.status === 'ACTIVE';
    newConcepts.push({
      name: p.name,
      track,
      description: p.description,
      aliases: p.aliases,
      status: autoApproved ? 'ACTIVE' : 'PROPOSED',
      autoApproved,
      parentId: parent?.id ?? null,
    });
  }

  return {
    newConcepts,
    aliasAdds,
    resolve(name) {
      const existing = resolveConcept(name, concepts);
      if (existing) return existing.status === 'REJECTED' ? undefined : existing.id;
      const created = resolveConcept(name, newTerms());
      return created && newConcepts[created.id]?.name;
    },
  };
}
