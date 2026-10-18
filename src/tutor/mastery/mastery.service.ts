import { Injectable } from '@nestjs/common';
import { MasteryRepository } from './mastery.repository.js';
import { applyAnswer, newMastery, type ConceptMastery, type GradedAnswer } from './mastery.js';

/** 개념별 복습 일정과 숙련도·약점 갱신 (설계 문서 5.3·8장). */
@Injectable()
export class MasteryService {
  constructor(private readonly repository: MasteryRepository) {}

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
}
