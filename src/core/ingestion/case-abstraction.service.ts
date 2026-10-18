import { inspect } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import pLimit from 'p-limit';
import { ClaudeClient, type ClaudeException, isStopError } from '../llm/claude.client.js';
import { type DecisionCaseBody, decisionCaseBodySchema } from '../memory/decision-case.js';
import { type CaseSourceCard, DecisionCaseRepository } from '../memory/decision-case.repository.js';
import {
  ABSTRACTION_SYSTEM_PROMPT,
  abstractionPrompt,
  caseText,
  HYPOTHETICAL_SYSTEM_PROMPT,
  HYPOTHETICAL_VERIFICATION_SYSTEM_PROMPT,
  hypotheticalProblems,
  hypotheticalPrompt,
  hypotheticalVerificationPrompt,
  hypotheticalVerificationSchema,
  SCREENING_SYSTEM_PROMPT,
  screeningPrompt,
  screeningSchema,
  VERIFICATION_SYSTEM_PROMPT,
  verificationProblems,
  verificationPrompt,
  verificationSchema,
} from './case-abstraction.js';
import { findLeaks, findLengthCue } from './case-gate.js';

export interface CaseAbstractionReport {
  /** 이번에 선별한 카드 수와 그중 판단이 분명하다고 고른 수. */
  readonly screened: number;
  readonly decisions: number;
  /** 게이트를 다 통과해 ACTIVE로 저장한 경험 사례·가정 사례와, 끝내 걸려 검토 대기로 저장한 사례. */
  readonly experience: number;
  readonly hypothetical: number;
  readonly pending: number;
  /** 추상화하지 못한 카드. 사례가 없으니 다음 실행이 다시 고른다. */
  readonly failed: readonly { readonly title: string; readonly error: string }[];
  /** 사용량 한도나 로그인 문제로 중간에 멈췄으면 그 이유. */
  readonly stopped: string | null;
}

type Outcome = 'experience' | 'hypothetical' | 'pending';

/** 마지막으로 쓴 본문과 그것이 걸린 이유. 이유가 비어 있으면 통과다. */
interface Attempt {
  readonly body: DecisionCaseBody;
  readonly problems: readonly string[];
}

/** 선별 호출 한 번에 넣는 카드 수. 카드 한 장이 1천 자 안팎이라 4만 자 정도다. */
const SCREENING_BATCH = 40;
/** 다시 쓰는 횟수까지 합친 시도 수 (ADR-0021·0026: 걸리면 1회 다시 생성). 경험 사례와 가정 사례에 따로 센다. */
const ATTEMPTS = 2;

const noteSection = (title: string, problems: readonly string[]) =>
  `${title}:\n${problems.map((p) => `- ${p}`).join('\n')}`;

/**
 * 경험 카드에서 판단 사례를 만든다 (ADR-0021·0024·0026, 설계 문서 7.1 "판단 사례").
 * 선별(Sonnet, 카드 여러 장을 한 번에) → 경험 사례 치환(Sonnet) → 패턴 게이트(코드) → 원래 카드와 비교 검증(Opus).
 * 경험 사례가 두 번 다 걸리면 가정 사례(Sonnet) → 패턴 게이트 → 정답을 숨긴 풀이 검증(Opus)으로 폴백한다.
 * 그것도 두 번 다 걸리면 마지막 경험 사례를 PENDING으로 두고 두 쪽의 걸린 이유를 남긴다.
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
    const report = { screened: 0, decisions: 0, experience: 0, hypothetical: 0, pending: 0 };
    const failed: { title: string; error: string }[] = [];
    let stop: ClaudeException | undefined;
    try {
      const cards =
        options.ids === undefined
          ? await this.screenUntil(options.limit ?? Number.MAX_SAFE_INTEGER, report)
          : await this.cases.findCards(options.ids);
      // 카드끼리는 서로 상관없어 클라이언트가 동시에 돌리는 수만큼 함께 처리한다. 멈출 오류가 나면 새 카드는 시작하지 않는다.
      const limit = pLimit(this.claude.maxConcurrency);
      await Promise.all(
        cards.map((card) =>
          limit(async () => {
            if (stop !== undefined) return;
            try {
              report[await this.abstract(card)] += 1;
            } catch (e) {
              if (isStopError(e)) {
                stop ??= e;
                return;
              }
              this.logger.warn(`판단 사례 추상화 실패: ${card.title} (${card.id}) ${inspect(e)}`);
              failed.push({ title: card.title, error: e instanceof Error ? e.message : String(e) });
            }
          }),
        ),
      );
    } catch (e) {
      if (isStopError(e)) stop = e;
      else throw e;
    }
    return { ...report, failed, stopped: stop === undefined ? null : `${stop.type}: ${stop.message}` };
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

  private async abstract(card: CaseSourceCard): Promise<Outcome> {
    const now = this.clock.now();
    const experience = await this.attempt(
      (problems) =>
        this.claude.completeStructured(
          {
            purpose: 'CASE_ABSTRACTION',
            systemPrompt: ABSTRACTION_SYSTEM_PROMPT,
            prompt: abstractionPrompt(card, problems),
          },
          decisionCaseBodySchema,
        ),
      async (body) =>
        verificationProblems(
          await this.claude.completeStructured(
            {
              purpose: 'CASE_VERIFICATION',
              systemPrompt: VERIFICATION_SYSTEM_PROMPT,
              prompt: verificationPrompt(card, body),
            },
            verificationSchema,
          ),
        ),
    );
    const save = (kind: 'EXPERIENCE' | 'HYPOTHETICAL', { body }: Attempt, reviewNote: string | null) =>
      this.cases.save({
        experienceId: card.id,
        kind,
        body,
        status: reviewNote === null ? 'ACTIVE' : 'PENDING',
        reviewNote,
        now,
      });
    if (experience.problems.length === 0) {
      await save('EXPERIENCE', experience, null);
      return 'experience';
    }

    const hypothetical = await this.attempt(
      (problems) =>
        this.claude.completeStructured(
          {
            purpose: 'CASE_HYPOTHETICAL',
            systemPrompt: HYPOTHETICAL_SYSTEM_PROMPT,
            prompt: hypotheticalPrompt(card, experience.problems, problems),
          },
          decisionCaseBodySchema,
        ),
      async (body) =>
        hypotheticalProblems(
          await this.claude.completeStructured(
            {
              purpose: 'CASE_HYPOTHETICAL_VERIFICATION',
              systemPrompt: HYPOTHETICAL_VERIFICATION_SYSTEM_PROMPT,
              prompt: hypotheticalVerificationPrompt(body),
            },
            hypotheticalVerificationSchema,
          ),
          body,
        ),
    );
    if (hypothetical.problems.length === 0) {
      await save('HYPOTHETICAL', hypothetical, null);
      return 'hypothetical';
    }
    await save(
      'EXPERIENCE',
      experience,
      [noteSection('경험 사례', experience.problems), noteSection('가정 사례', hypothetical.problems)].join('\n'),
    );
    return 'pending';
  }

  /** 쓰기 → 패턴 게이트 → 검증을 [ATTEMPTS]번까지. 걸리면 이유를 붙여 다시 쓰고, 통과하거나 다 쓰면 마지막 결과를 준다. */
  private async attempt(
    write: (problems: readonly string[]) => Promise<DecisionCaseBody>,
    verify: (body: DecisionCaseBody) => Promise<string[]>,
  ): Promise<Attempt> {
    let problems: readonly string[] = [];
    for (let i = 1; ; i++) {
      const body = await write(problems);
      const leaks = findLeaks(caseText(body));
      const cue = findLengthCue(body.options);
      const gate = [
        ...(leaks.length === 0 ? [] : [`모양 검사에 걸린 문자열(역할 설명으로 바꾼다): ${leaks.join(', ')}`]),
        ...(cue === undefined
          ? []
          : [
              `정답 보기만 길다(${cue.chosen}자, 가장 긴 오답 ${cue.longestOther}자): 보기를 비슷한 길이로, 세부는 결정·근거로 옮긴다`,
            ]),
      ];
      problems = gate.length > 0 ? gate : await verify(body);
      if (problems.length === 0 || i === ATTEMPTS) return { body, problems };
    }
  }
}
