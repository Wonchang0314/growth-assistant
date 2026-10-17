import { Injectable } from '@nestjs/common';
import { matchConcepts, type RelatedConcept, resolveConcept } from './concept.js';
import { ConceptRepository } from './concept.repository.js';
import type { Vocabulary } from './concept-proposal.js';

const RELATED_LIMIT = 5;
/** 선수 관계를 따라가는 깊이. 바로 앞 단계와 그 앞 단계까지만 맥락에 싣는다. */
const PREREQUISITE_DEPTH = 2;

/** 학습 맥락에 쓰는 개념 조회 (설계 문서 7.2). 승인된(ACTIVE) 개념만 다룬다. */
@Injectable()
export class ConceptService {
  constructor(private readonly repository: ConceptRepository) {}

  /** 수집할 때 새 개념 제안을 처리하는 데 쓰는 전체 어휘 (승인 대기·거절 개념 포함). */
  vocabulary(): Promise<Vocabulary> {
    return this.repository.findVocabulary();
  }

  /** 주제와 관련 있는 개념과 그 상위·선수 개념. 맞는 개념이 없으면 빈 배열. */
  async relatedConcepts(topic: string): Promise<RelatedConcept[]> {
    const matched = matchConcepts(topic, await this.repository.findActiveTerms(), RELATED_LIMIT);
    const ids = matched.map((c) => c.id);
    const [summaries, prerequisites] = await Promise.all([
      this.repository.findSummaries(ids),
      this.repository.findPrerequisites(ids, PREREQUISITE_DEPTH),
    ]);
    return summaries.map((s) => ({ ...s, prerequisites: prerequisites.get(s.id) ?? [] }));
  }

  /**
   * 개념 이름(또는 별칭)을 id로 바꾼다. 정규화한 이름이 정확히 같아야 한다.
   * [unknown]은 개념 목록에 없는 이름이다. 새 개념 제안·승인은 수집 단계에서 정한다.
   */
  async resolve(names: readonly string[]): Promise<{
    /** [index]는 [names]에서의 위치다. */
    resolved: { index: number; id: number; conceptName: string }[];
    unknown: string[];
  }> {
    if (names.length === 0) return { resolved: [], unknown: [] };
    const terms = await this.repository.findActiveTerms();
    const resolved: { index: number; id: number; conceptName: string }[] = [];
    const unknown: string[] = [];
    names.forEach((name, index) => {
      const found = resolveConcept(name, terms);
      if (found) resolved.push({ index, id: found.id, conceptName: found.name });
      else unknown.push(name);
    });
    return { resolved, unknown };
  }
}
