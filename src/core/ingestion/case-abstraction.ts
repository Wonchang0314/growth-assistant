import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { DecisionCaseBody } from '../memory/decision-case.js';
import type { CaseSourceCard } from '../memory/decision-case.repository.js';

/** 선별 응답. 입력한 카드마다 하나씩 답한다. */
export const screeningSchema = z.object({
  cards: z.array(
    z.object({
      id: z.number().int().describe('입력 카드의 id'),
      hasDecision: z.boolean().describe('상황 판단형 문제로 만들 만큼 판단이 분명하면 true'),
    }),
  ),
});

/** 독립 검증 응답 (ADR-0021·0024). 모두 true이고 남은 이름이 없어야 통과다. */
export const verificationSchema = z.object({
  sameConclusion: z.boolean().describe('판단 사례만 보고도 원래 카드와 같은 결론에 이르는가'),
  invariantsKept: z.boolean().describe('원래 카드에서 결론을 정한 사실이 모두 살아 있는가'),
  selfContained: z.boolean().describe('회사 밖 개발자가 판단 사례만 읽고 이해할 수 있는가'),
  leakedNames: z.array(z.string()).describe('판단 사례에 남은, 특정 조직을 가리키는 이름'),
  problems: z.array(z.string()).describe('통과하지 못한 이유. 고칠 사람이 바로 고칠 수 있게 한 항목에 하나씩'),
});
export type Verification = z.infer<typeof verificationSchema>;

export const passed = (v: Verification): boolean =>
  v.sameConclusion && v.invariantsKept && v.selfContained && v.leakedNames.length === 0;

const prompt = (name: string) => readFileSync(join(import.meta.dirname, 'prompts', `${name}.md`), 'utf8').trim();
export const SCREENING_SYSTEM_PROMPT = prompt('case-screening');
export const ABSTRACTION_SYSTEM_PROMPT = prompt('case-abstraction');
export const VERIFICATION_SYSTEM_PROMPT = prompt('case-verification');

const cardText = (c: CaseSourceCard) =>
  [
    `### ${c.title}`,
    ...(c.projectName === null ? [] : [`프로젝트: ${c.projectName}`]),
    `상황: ${c.situation}`,
    `과제: ${c.task}`,
    `행동: ${c.action}`,
    `결과: ${c.result}`,
    `교훈: ${c.lesson}`,
  ].join('\n');

export const screeningPrompt = (cards: readonly CaseSourceCard[]): string =>
  cards.map((c) => `## id ${c.id}\n${cardText(c)}`).join('\n\n');

/** [problems]는 지난 결과가 게이트나 검증에 걸린 이유다. 처음이면 비어 있다. */
export function abstractionPrompt(card: CaseSourceCard, problems: readonly string[]): string {
  const retry = problems.length === 0 ? [] : [`## 지난 결과의 문제\n${problems.map((p) => `- ${p}`).join('\n')}`];
  return [`## 경험 카드\n${cardText(card)}`, ...retry].join('\n\n');
}

export const verificationPrompt = (card: CaseSourceCard, body: DecisionCaseBody): string =>
  [`## 원래 경험 카드\n${cardText(card)}`, `## 판단 사례\n${JSON.stringify(body, null, 2)}`].join('\n\n');

/** 패턴 게이트가 보는 글: 판단 사례의 모든 문자열 필드. */
export const caseText = (body: DecisionCaseBody): string =>
  [
    body.situation,
    ...body.constraints,
    ...body.options.flatMap((o) => [o.text, o.reason]),
    body.decision,
    body.rationale,
    body.outcome,
    ...body.invariants,
  ].join('\n');
