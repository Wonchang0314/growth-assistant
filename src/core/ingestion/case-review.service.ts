import { Injectable } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { type DecisionCaseBody, decisionCaseBodySchema } from '../memory/decision-case.js';
import { DecisionCaseRepository, type PendingCase } from '../memory/decision-case.repository.js';
import { caseText } from './case-abstraction.js';
import { findLeaks } from './case-gate.js';

export type CaseReviewDecision =
  | { readonly kind: 'APPROVE'; readonly edit: Partial<DecisionCaseBody>; readonly note: string | null }
  | { readonly kind: 'REJECT'; readonly note: string | null };

/**
 * 게이트에 걸린 판단 사례를 사람이 검토한다 (ADR-0021 5절, 설계 문서 7.1 "판단 사례").
 * 고쳐서 승인할 때도 패턴 게이트를 다시 거친다. 사람이 고친 글에 사내 식별자가 섞여 들어가는 것을 막기 위해서다.
 */
@Injectable()
export class CaseReviewService {
  constructor(
    private readonly cases: DecisionCaseRepository,
    private readonly clock: Clock,
  ) {}

  listPending(limit: number): Promise<PendingCase[]> {
    return this.cases.findPending(limit);
  }

  /** 검토를 반영하고 결과를 한 줄로 돌려준다. 잘못된 요청이면 아무것도 바꾸지 않고 예외를 던진다. */
  async review(caseId: number, decision: CaseReviewDecision): Promise<string> {
    const now = this.clock.now();
    if (decision.kind === 'REJECT') {
      if (!(await this.cases.review(caseId, { status: 'REJECTED', reviewNote: decision.note, now }))) {
        throw new Error(`없는 판단 사례: ${caseId}`);
      }
      return `거절: 사례 ${caseId}`;
    }

    const current = await this.cases.findBody(caseId);
    if (current === undefined) throw new Error(`없는 판단 사례: ${caseId}`);
    const body = decisionCaseBodySchema.parse({ ...current, ...decision.edit });
    const leaks = findLeaks(caseText(body));
    if (leaks.length > 0) throw new Error(`패턴 검사에 걸렸다(역할 설명으로 바꾼다): ${leaks.join(', ')}`);
    await this.cases.review(caseId, { body, status: 'ACTIVE', reviewNote: decision.note, now });
    const edited = Object.keys(decision.edit);
    return edited.length === 0 ? `승인: 사례 ${caseId}` : `승인: 사례 ${caseId} (고친 항목: ${edited.join(', ')})`;
  }
}
