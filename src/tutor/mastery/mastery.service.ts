import { Injectable } from '@nestjs/common';
import { ConceptService } from '../../core/knowledge/concept.service.js';
import { MasteryRepository } from './mastery.repository.js';
import { applyAnswer, levelsOf, newMastery, replay, type ConceptMastery, type GradedAnswer } from './mastery.js';
import { type RootCause, rootCauses } from './root-cause.js';

/** 근본 원인을 찾을 때 살펴보는 약점 개념 수와 선수 관계 깊이. */
const WEAK_SCAN_LIMIT = 30;
const ROOT_CAUSE_DEPTH = 3;

/** 개념별 복습 일정과 숙련도·약점 갱신, 근본 원인 후보 (설계 문서 5.3·8장). */
@Injectable()
export class MasteryService {
  constructor(
    private readonly repository: MasteryRepository,
    private readonly concepts: ConceptService,
  ) {}

  find(conceptId: number): Promise<ConceptMastery | undefined> {
    return this.repository.find(conceptId);
  }

  findMany(conceptIds: readonly number[]): Promise<ConceptMastery[]> {
    return this.repository.findMany(conceptIds);
  }

  /** 약점 개념(채점 2회 이상, 약점 점수 0.5 이상). 약점 점수가 높은 것부터. */
  weakConcepts(limit: number): Promise<ConceptMastery[]> {
    return this.repository.findWeak(limit);
  }

  /** [timeZone]의 [date] 안에 복습할 때가 되는 개념. 예정일이 이른 것부터. */
  dueOn(date: string, timeZone: string, limit: number): Promise<number[]> {
    return this.repository.findDueOn(date, timeZone, limit);
  }

  /** 근본 원인 후보 (설계 문서 8장). 약점 개념 [WEAK_SCAN_LIMIT]개의 선수 개념을 [ROOT_CAUSE_DEPTH]단계까지 거슬러 올라간다. */
  async rootCauses(): Promise<RootCause[]> {
    const ids = (await this.repository.findWeak(WEAK_SCAN_LIMIT)).map((m) => m.conceptId);
    if (ids.length === 0) return [];
    const [summaries, prerequisites] = await Promise.all([
      this.concepts.summaries(ids),
      this.concepts.prerequisites(ids, ROOT_CAUSE_DEPTH),
    ]);
    const prerequisiteIds = [...new Set([...prerequisites.values()].flat().map((c) => c.id))];
    const levels = levelsOf(await this.repository.findMany(prerequisiteIds));
    return rootCauses({ weak: summaries, prerequisites, levels });
  }

  countUnmeasured(): Promise<number> {
    return this.repository.countUnmeasured();
  }

  /** 아직 일정이 없는 승인된 개념과 트랙 가중치. 복습에서 새 개념을 뽑을 때 쓴다. */
  unscheduled(): Promise<{ conceptId: number; weight: number }[]> {
    return this.repository.findUnscheduled();
  }

  /**
   * 학습 기록에서 다룬 개념(DISCUSSED·CONFUSED)을 [at]부터 복습할 수 있게 일정에 넣는다 (ADR-0028).
   * 점수는 바꾸지 않고, 이미 일정이 있는 개념은 그대로 둔다. CONFUSED는 출제할 때 학습 기록에서 읽는다.
   */
  async introduce(conceptIds: readonly number[], at: Date): Promise<void> {
    await this.repository.addMissing(conceptIds.map((id) => newMastery(id, at)));
  }

  /** 채점된 응답 하나를 반영한다. 퀴즈 채점(`submit_answer`)이 부른다. */
  async recordAnswer(answer: GradedAnswer): Promise<ConceptMastery> {
    const prev = (await this.repository.find(answer.conceptId)) ?? newMastery(answer.conceptId, answer.answeredAt);
    const next = applyAnswer(prev, answer);
    await this.repository.save(next);
    return next;
  }

  /** 응답 기록으로 처음부터 다시 계산해 바꾼다. 문제가 신고되면 그 풀이를 뺀 기록으로 부른다. */
  async recompute(conceptId: number, answers: readonly GradedAnswer[], at: Date): Promise<ConceptMastery> {
    const next = replay(conceptId, answers, at);
    await this.repository.save(next);
    return next;
  }
}
