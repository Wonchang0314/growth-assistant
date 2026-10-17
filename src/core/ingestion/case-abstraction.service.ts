import { inspect } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { ClaudeClient, isStopError } from '../llm/claude.client.js';
import { type DecisionCaseBody, type DecisionCaseStatus, decisionCaseBodySchema } from '../memory/decision-case.js';
import { type CaseSourceCard, DecisionCaseRepository } from '../memory/decision-case.repository.js';
import {
  ABSTRACTION_SYSTEM_PROMPT,
  abstractionPrompt,
  caseText,
  passed,
  SCREENING_SYSTEM_PROMPT,
  screeningPrompt,
  screeningSchema,
  VERIFICATION_SYSTEM_PROMPT,
  verificationPrompt,
  verificationSchema,
} from './case-abstraction.js';
import { findLeaks } from './case-gate.js';

export interface CaseAbstractionReport {
  /** 이번에 선별한 카드 수와 그중 판단이 분명하다고 고른 수. */
  readonly screened: number;
  readonly decisions: number;
  /** 게이트를 다 통과해 저장한 사례와, 끝내 걸려 검토 대기로 저장한 사례. */
  readonly active: number;
  readonly pending: number;
  /** 추상화하지 못한 카드. 사례가 없으니 다음 실행이 다시 고른다. */
  readonly failed: readonly { readonly title: string; readonly error: string }[];
  /** 사용량 한도나 로그인 문제로 중간에 멈췄으면 그 이유. */
  readonly stopped: string | null;
}

/** 선별 호출 한 번에 넣는 카드 수. 카드 한 장이 1천 자 안팎이라 4만 자 정도다. */
const SCREENING_BATCH = 40;
/** 추상화를 다시 쓰는 횟수까지 합친 시도 수 (ADR-0021: 걸리면 1회 다시 생성). */
const ATTEMPTS = 2;

/**
 * 경험 카드에서 판단 사례를 만든다 (ADR-0021·0024, 설계 문서 7.1 "판단 사례").
 * 선별(Sonnet, 카드 여러 장을 한 번에) → 치환(Sonnet) → 패턴 게이트(코드) → 독립 검증(Opus).
 * 게이트나 검증에 걸리면 이유를 붙여 한 번 다시 쓰고, 그래도 걸리면 마지막 결과를 PENDING으로 둔다.
 */
@Injectable()
export class CaseAbstractionService {
  private readonly logger = new Logger(CaseAbstractionService.name);

  constructor(
    private readonly claude: ClaudeClient,
    private readonly cases: DecisionCaseRepository,
    private readonly clock: Clock,
  ) {}

  /** [ids]를 주면 선별 없이 그 카드만(이미 있으면 다시), 아니면 선별된 카드 중 아직 사례가 없는 것을 [limit]개까지. */
  async run(options: {
    ids?: readonly number[] | undefined;
    limit?: number | undefined;
  }): Promise<CaseAbstractionReport> {
    const report = { screened: 0, decisions: 0, active: 0, pending: 0 };
    const failed: { title: string; error: string }[] = [];
    try {
      const cards =
        options.ids === undefined
          ? await this.screenUntil(options.limit ?? Number.MAX_SAFE_INTEGER, report)
          : await this.cases.findCards(options.ids);
      for (const card of cards) {
        try {
          const status = await this.abstract(card);
          report[status === 'ACTIVE' ? 'active' : 'pending'] += 1;
        } catch (e) {
          if (isStopError(e)) throw e;
          this.logger.warn(`판단 사례 추상화 실패: ${card.title} (${card.id}) ${inspect(e)}`);
          failed.push({ title: card.title, error: e instanceof Error ? e.message : String(e) });
        }
      }
    } catch (e) {
      if (isStopError(e)) return { ...report, failed, stopped: `${e.type}: ${e.message}` };
      throw e;
    }
    return { ...report, failed, stopped: null };
  }

  /** 아직 사례가 없는 후보가 [limit]개가 되거나 선별할 카드가 없을 때까지 선별한다. */
  private async screenUntil(limit: number, report: { screened: number; decisions: number }): Promise<CaseSourceCard[]> {
    for (;;) {
      const candidates = await this.cases.findCandidates(limit);
      const batch = candidates.length < limit ? await this.cases.findUnscreened(SCREENING_BATCH) : [];
      if (batch.length === 0) return candidates;

      const { cards } = await this.claude.completeStructured(
        { purpose: 'CASE_SCREENING', systemPrompt: SCREENING_SYSTEM_PROMPT, prompt: screeningPrompt(batch) },
        screeningSchema,
      );
      const asked = new Set(batch.map((c) => c.id));
      const results = cards
        .filter((c) => asked.has(c.id))
        .map((c) => ({ id: c.id, screen: c.hasDecision ? ('DECISION' as const) : ('NO_DECISION' as const) }));
      // 응답에서 빠진 카드는 다음 묶음에 다시 들어간다. 하나도 답하지 않으면 같은 묶음을 계속 묻게 되므로 멈춘다.
      if (results.length === 0) throw new Error('선별 응답에 입력한 카드가 하나도 없다');
      await this.cases.saveScreening(results);
      report.screened += results.length;
      report.decisions += results.filter((r) => r.screen === 'DECISION').length;
    }
  }

  private async abstract(card: CaseSourceCard): Promise<DecisionCaseStatus> {
    let problems: string[] = [];
    let body: DecisionCaseBody | undefined;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      body = await this.claude.completeStructured(
        {
          purpose: 'CASE_ABSTRACTION',
          systemPrompt: ABSTRACTION_SYSTEM_PROMPT,
          prompt: abstractionPrompt(card, problems),
        },
        decisionCaseBodySchema,
      );
      const leaks = findLeaks(caseText(body));
      if (leaks.length > 0) {
        problems = [`모양 검사에 걸린 문자열(역할 설명으로 바꾼다): ${leaks.join(', ')}`];
        continue;
      }
      const verification = await this.claude.completeStructured(
        {
          purpose: 'CASE_VERIFICATION',
          systemPrompt: VERIFICATION_SYSTEM_PROMPT,
          prompt: verificationPrompt(card, body),
        },
        verificationSchema,
      );
      if (passed(verification)) return this.save(card, body, 'ACTIVE', null);
      problems = [
        ...verification.problems,
        ...(verification.leakedNames.length === 0 ? [] : [`남은 이름: ${verification.leakedNames.join(', ')}`]),
      ];
    }
    if (body === undefined) throw new Error('추상화를 한 번도 시도하지 않았다');
    return this.save(card, body, 'PENDING', problems.join('\n'));
  }

  private async save(
    card: CaseSourceCard,
    body: DecisionCaseBody,
    status: DecisionCaseStatus,
    reviewNote: string | null,
  ): Promise<DecisionCaseStatus> {
    await this.cases.save({ experienceId: card.id, body, status, reviewNote, now: this.clock.now() });
    return status;
  }
}
