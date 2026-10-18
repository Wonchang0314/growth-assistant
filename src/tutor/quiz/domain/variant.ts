import type { Confidence } from '../../mastery/mastery.js';
import { normalizeAnswer, type Question, type QuestionDraft } from './quiz-question.js';

/**
 * 문제의 마지막 풀이 상태. 틀렸거나, 찍었거나, 힌트를 쓴 풀이는 흔들린(SHAKY) 것으로 보고 다음에 변형을 먼저 낸다.
 * 힌트 없이 찍지 않고 맞혔으면 확인된(CONFIRMED) 것이다 (설계 문서 7.3).
 */
export type AnswerStatus = 'UNANSWERED' | 'SHAKY' | 'CONFIRMED';

export interface LastAnswer {
  readonly correct: boolean;
  readonly confidence: Confidence;
  readonly hintUsed: boolean;
  readonly userAnswer: string;
  readonly misconception: string | null;
}

export function answerStatus(last: LastAnswer | null): AnswerStatus {
  if (last === null) return 'UNANSWERED';
  return last.correct && !last.hintUsed && last.confidence !== 'GUESS' ? 'CONFIRMED' : 'SHAKY';
}

/** 개념의 (검증 통과, 신고 안 된) 문제 하나와 그 풀이 상태. */
export interface QuestionHistory {
  readonly question: Question;
  readonly lastAnswer: LastAnswer | null;
  /** 이미 이 문제의 변형(검증 통과, 신고 안 됨)이 있는가. */
  readonly hasVariant: boolean;
}

export type NextQuestion<Case> =
  | { readonly kind: 'NEW' }
  | { readonly kind: 'VARIANT'; readonly of: QuestionHistory }
  | { readonly kind: 'SCENARIO'; readonly case: Case };

/** 상황 판단형 하나 뒤에 내는 개념 문제 수 (사용자 결정 2026-10-18, ADR-0033). */
const CONCEPTS_PER_SCENARIO = 2;

/**
 * 개념에 새로 만들 문제를 정한다 (설계 문서 7.3 "변형 문제", ADR-0032·0033).
 * ① 흔들린 문제가 있으면 그 변형
 * ② 아직 문제로 쓰지 않은 판단 사례가 있고 상황 판단형 차례면 상황 판단형. 마지막 상황 판단형 뒤로 개념 문제가
 *    [CONCEPTS_PER_SCENARIO]개 나왔거나 아직 상황 판단형이 없으면 차례다(개념 2 : 상황 판단형 1, ADR-0033)
 * ③ 확인된 핵심의 변형과 아직 묻지 않은 핵심을 번갈아(가장 최근 문제가 변형이 아니면 변형)
 * 변형이 이미 있는 문제는 다시 변형하지 않는다. [history]는 오래된 것부터, [unusedCases]는 먼저 쓸 것부터다.
 */
export function nextQuestion<Case>(
  history: readonly QuestionHistory[],
  unusedCases: readonly Case[] = [],
): NextQuestion<Case> {
  const open = (status: AnswerStatus) => history.find((h) => !h.hasVariant && answerStatus(h.lastAnswer) === status);
  const shaky = open('SHAKY');
  if (shaky) return { kind: 'VARIANT', of: shaky };
  const latest = history.at(-1);
  const lastScenario = history.findLastIndex((h) => h.question.angle === 'SCENARIO');
  const scenarioTurn = lastScenario === -1 || history.length - 1 - lastScenario >= CONCEPTS_PER_SCENARIO;
  const unusedCase = unusedCases[0];
  if (unusedCase !== undefined && scenarioTurn) return { kind: 'SCENARIO', case: unusedCase };
  // 개념 문제 차례에는 상황 판단형의 변형을 고르지 않는다. 그것도 상황 판단형이라서다.
  const confirmed = history.find(
    (h) =>
      !h.hasVariant && answerStatus(h.lastAnswer) === 'CONFIRMED' && (scenarioTurn || h.question.angle !== 'SCENARIO'),
  );
  if (confirmed && latest?.question.variantOf === null) return { kind: 'VARIANT', of: confirmed };
  return { kind: 'NEW' };
}

/** 변형 문제가 원래 문제와 같은 핵심을 묻고, 원래 답을 외워서는 풀 수 없는지 본 결과 (설계 문서 7.3 "검증 단계"). */
export interface VariantCheck {
  readonly sameKeyPoint: boolean;
  readonly solvableByMemory: boolean;
  readonly problems: readonly string[];
}

export const variantCheckProblems = (check: VariantCheck): string[] => [
  ...(check.sameKeyPoint ? [] : ['원래 문제와 다른 핵심을 묻는다']),
  ...(check.solvableByMemory ? ['원래 문제의 답을 기억하면 그대로 풀 수 있다'] : []),
  ...check.problems,
];

/** 변형 문제의 모양 검사. 원래 문제의 질문이나 보기를 그대로 쓰면 답을 외워서 풀 수 있다. */
export function variantProblems(original: Question, draft: QuestionDraft): string[] {
  const problems: string[] = [];
  if (normalizeAnswer(original.prompt) === normalizeAnswer(draft.prompt)) problems.push('질문이 원래 문제와 같다');
  // 빈칸은 같은 핵심이면 같은 용어가 답일 수 있어, 외워서 풀 수 있는지는 비교 검증이 본다.
  if (original.type === 'MULTIPLE_CHOICE' && draft.type === 'MULTIPLE_CHOICE') {
    const before = new Set(original.choices.map((c) => normalizeAnswer(c.text)));
    if (draft.choices.every((c) => before.has(normalizeAnswer(c.text)))) problems.push('보기가 원래 문제와 같다');
    if (normalizeAnswer(original.answer) === normalizeAnswer(draft.answer)) {
      problems.push('정답 보기가 원래 문제와 같다. 원래 답을 외워서 풀 수 있다');
    }
  }
  return problems;
}
