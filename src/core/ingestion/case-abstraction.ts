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

/**
 * 검증에 걸린 이유. 통과하면 빈 배열이다. 걸렸는데 검증이 이유를 쓰지 않았으면 [fallback]을 둔다.
 * 다시 쓸 때 붙이고, 끝내 걸리면 review_note에 남긴다.
 */
function failureReasons(ok: boolean, reasons: readonly string[], leakedNames: readonly string[], fallback: string) {
  if (ok && leakedNames.length === 0) return [];
  const all = [...reasons, ...(leakedNames.length === 0 ? [] : [`남은 이름: ${leakedNames.join(', ')}`])];
  return all.length === 0 ? [fallback] : all;
}

export const verificationProblems = (v: Verification): string[] =>
  failureReasons(
    v.sameConclusion && v.invariantsKept && v.selfContained,
    v.problems,
    v.leakedNames,
    '검증 항목 중 통과하지 못한 것이 있다',
  );

/** 가정 사례 검증 응답 (ADR-0026). 정답을 주지 않고 풀게 한다. */
export const hypotheticalVerificationSchema = z.object({
  answer: z.number().int().describe('고른 선택지 번호 (1부터)'),
  singleAnswer: z.boolean().describe('제약을 따르면 정답이 하나로 정해지는가'),
  selfContained: z.boolean().describe('회사 밖 개발자가 문제만 읽고 이해할 수 있는가'),
  leakedNames: z.array(z.string()).describe('문제에 남은, 특정 조직을 가리키는 이름'),
  problems: z.array(z.string()).describe('통과하지 못한 이유. 고칠 사람이 바로 고칠 수 있게 한 항목에 하나씩'),
});
export type HypotheticalVerification = z.infer<typeof hypotheticalVerificationSchema>;

/** 가정 사례 검증에 걸린 이유. 정답을 모르고 푼 답이 사례의 정답과 같아야 통과다. */
export function hypotheticalProblems(v: HypotheticalVerification, body: DecisionCaseBody): string[] {
  const chosen = body.options.findIndex((o) => o.chosen) + 1;
  const sameAnswer = v.answer === chosen;
  return failureReasons(
    sameAnswer && v.singleAnswer && v.selfContained,
    [
      ...(sameAnswer ? [] : [`정답을 모르고 푼 검토자가 ${v.answer}번을 골랐다(사례의 정답은 ${chosen}번)`]),
      ...v.problems,
    ],
    v.leakedNames,
    '정답이 하나로 정해지지 않거나 문제만 읽고 이해하기 어렵다',
  );
}

const prompt = (name: string) => readFileSync(join(import.meta.dirname, 'prompts', `${name}.md`), 'utf8').trim();
export const SCREENING_SYSTEM_PROMPT = prompt('case-screening');
export const ABSTRACTION_SYSTEM_PROMPT = prompt('case-abstraction');
export const VERIFICATION_SYSTEM_PROMPT = prompt('case-verification');
export const HYPOTHETICAL_SYSTEM_PROMPT = prompt('case-hypothetical');
export const HYPOTHETICAL_VERIFICATION_SYSTEM_PROMPT = prompt('case-hypothetical-verification');

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

/** 비어 있으면 빼는 `## 제목` 아래 목록. */
const listSection = (title: string, items: readonly string[]) =>
  items.length === 0 ? [] : [`## ${title}\n${items.map((i) => `- ${i}`).join('\n')}`];

/** [problems]는 지난 결과가 게이트나 검증에 걸린 이유다. 처음이면 비어 있다. */
export const abstractionPrompt = (card: CaseSourceCard, problems: readonly string[]): string =>
  [`## 경험 카드\n${cardText(card)}`, ...listSection('지난 결과의 문제', problems)].join('\n\n');

export const verificationPrompt = (card: CaseSourceCard, body: DecisionCaseBody): string =>
  [`## 원래 경험 카드\n${cardText(card)}`, `## 판단 사례\n${JSON.stringify(body, null, 2)}`].join('\n\n');

/** [experienceProblems]는 경험 사례가 걸린 이유, [problems]는 지난 가정 사례가 걸린 이유다. */
export const hypotheticalPrompt = (
  card: CaseSourceCard,
  experienceProblems: readonly string[],
  problems: readonly string[],
): string =>
  [
    `## 경험 카드\n${cardText(card)}`,
    ...listSection('경험 사례가 걸린 이유', experienceProblems),
    ...listSection('지난 가정 사례의 문제', problems),
  ].join('\n\n');

/** 정답을 숨긴 문제. 선택지 문장만 번호를 붙여 보내고 chosen·reason·결정·근거는 뺀다. */
export const hypotheticalVerificationPrompt = (body: DecisionCaseBody): string =>
  [
    `## 상황\n${body.situation}`,
    ...listSection('제약', body.constraints),
    `## 선택지\n${body.options.map((o, i) => `${i + 1}. ${o.text}`).join('\n')}`,
  ].join('\n\n');

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
