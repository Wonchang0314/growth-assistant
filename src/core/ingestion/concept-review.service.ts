import { Injectable } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { normalizeTerm, resolveConcept } from '../knowledge/concept.js';
import type { VocabularyConcept } from '../knowledge/concept-proposal.js';
import { ConceptService } from '../knowledge/concept.service.js';
import { ConceptReviewRepository, type PendingConcept } from './concept-review.repository.js';

/** 승인하면서 고칠 값. 주지 않은 값은 그대로 두고, [parent]를 null로 주면 상위 관계를 지운다. */
export interface ConceptEdit {
  readonly name?: string | undefined;
  readonly track?: string | undefined;
  readonly parent?: string | null | undefined;
  readonly description?: string | undefined;
  readonly aliases?: readonly string[] | undefined;
}

export type ReviewDecision =
  | { readonly kind: 'APPROVE'; readonly edit: ConceptEdit }
  | { readonly kind: 'MERGE'; readonly into: string }
  | { readonly kind: 'REJECT' };

/**
 * 수집에서 생긴 개념을 사람이 검토한다 (ADR-0007, 설계 문서 6장). 개념은 이름이나 별칭으로 찾는다.
 * 시드 개념은 YAML이 원천이라 여기서 바꾸지 않는다.
 */
@Injectable()
export class ConceptReviewService {
  constructor(
    private readonly repository: ConceptReviewRepository,
    private readonly concepts: ConceptService,
    private readonly clock: Clock,
  ) {}

  /** 승인 대기 개념과, 자동 승인됐지만 사람이 아직 보지 않은 개념. */
  listPending(limit: number): Promise<PendingConcept[]> {
    return this.repository.findPending(limit);
  }

  /** 검토를 반영하고 결과를 한 줄로 돌려준다. 잘못된 요청이면 아무것도 바꾸지 않고 예외를 던진다. */
  async review(input: { concept: string; decision: ReviewDecision }): Promise<string> {
    const vocabulary = await this.concepts.vocabulary();
    const subject = findConcept(input.concept, vocabulary.concepts);
    if (subject.origin === 'SEED') throw new Error(`시드 개념은 YAML로 고친다: ${subject.name}`);
    const others = vocabulary.concepts.filter((c) => c.id !== subject.id);
    const now = this.clock.now();
    const { decision } = input;

    switch (decision.kind) {
      case 'APPROVE': {
        const { edit } = decision;
        const clash = edit.name === undefined ? undefined : resolveConcept(edit.name, others);
        if (clash) throw new Error(`같은 이름이나 별칭의 개념이 이미 있다: ${clash.name}`);
        if (edit.track !== undefined && !vocabulary.tracks.includes(edit.track)) {
          throw new Error(`없는 트랙: ${edit.track} (트랙: ${vocabulary.tracks.join(', ')})`);
        }
        const parentId =
          edit.parent === undefined || edit.parent === null
            ? edit.parent
            : findConcept(
                edit.parent,
                others.filter((c) => c.status !== 'REJECTED'),
              ).id;
        await this.repository.approve({ ...edit, id: subject.id, parentId, now });
        const name = edit.name ?? subject.name;
        return name === subject.name ? `승인: ${name}` : `승인: ${name} (이전 이름 ${subject.name})`;
      }
      case 'MERGE': {
        const target = findConcept(decision.into, vocabulary.concepts);
        if (target.id === subject.id) throw new Error(`자기 자신으로 병합할 수 없다: ${subject.name}`);
        if (target.status === 'REJECTED') throw new Error(`거절된 개념으로 병합할 수 없다: ${target.name}`);
        const targetAliases = [...target.aliases];
        for (const term of [subject.name, ...subject.aliases]) {
          const known = normalizeTerm(term) === normalizeTerm(target.name);
          if (!known && !targetAliases.some((a) => normalizeTerm(a) === normalizeTerm(term))) targetAliases.push(term);
        }
        const moved = await this.repository.merge({ sourceId: subject.id, targetId: target.id, targetAliases, now });
        return `병합: ${subject.name} → ${target.name} (카드 연결 ${moved}개)`;
      }
      case 'REJECT':
        await this.repository.reject(subject.id, now);
        return `거절: ${subject.name}`;
      default: {
        const _exhaustive: never = decision;
        return _exhaustive;
      }
    }
  }
}

function findConcept(name: string, concepts: readonly VocabularyConcept[]): VocabularyConcept {
  const found = resolveConcept(name, concepts);
  if (!found) throw new Error(`개념 목록에 없다: ${name}`);
  return found;
}
