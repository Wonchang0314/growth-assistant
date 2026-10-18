import type { Confidence, GradedAnswer } from '../../mastery/mastery.js';
import { isAcceptedAnswer, normalizeAnswer, type Question } from './quiz-question.js';

/** 채점 결과. 객관식 [userAnswer]는 고른 보기의 글, [misconception]은 고른 오답 보기의 오개념이다. */
export interface Grading {
  readonly correct: boolean;
  readonly userAnswer: string;
  readonly misconception: string | null;
}

/**
 * 코드로 즉시 채점한다 (설계 문서 7.3). 객관식은 보기 번호("2", "2번")나 보기 글을 받는다.
 * 어느 보기인지 알 수 없으면 undefined다(호출한 쪽이 다시 묻게 한다).
 */
export function grade(question: Question, answer: string): Grading | undefined {
  if (question.type === 'FILL_BLANK') {
    return { correct: isAcceptedAnswer(question, answer), userAnswer: answer.trim(), misconception: null };
  }
  const number = /^\s*(\d+)\s*번?\s*$/.exec(answer)?.[1];
  const choice =
    number === undefined
      ? question.choices.find((c) => normalizeAnswer(c.text) === normalizeAnswer(answer))
      : question.choices[Number(number) - 1];
  if (!choice) return undefined;
  return { correct: choice.text === question.answer, userAnswer: choice.text, misconception: choice.misconception };
}

/** 저장된 풀이 하나. */
export interface AttemptRecord {
  readonly conceptId: number;
  readonly correct: boolean;
  readonly confidence: Confidence;
  readonly hintUsed: boolean;
  readonly misconception: string | null;
  readonly answeredAt: Date;
}

/**
 * 시간순 풀이 기록을 숙련도 계산 입력으로 바꾼다. 오답의 오개념이 그 개념에서 전에도 나왔으면 반복 오개념이다
 * (같은 오개념 2회 이상, 설계 문서 8장). 신고된 문제의 풀이는 넘기지 않는다.
 */
export function toGradedAnswers(attempts: readonly AttemptRecord[]): GradedAnswer[] {
  const seen = new Set<string>();
  return attempts.map((a) => {
    const base = { conceptId: a.conceptId, confidence: a.confidence, hintUsed: a.hintUsed, answeredAt: a.answeredAt };
    if (a.correct) return { ...base, result: 'CORRECT' };
    const key = a.misconception === null ? undefined : normalizeAnswer(a.misconception);
    const repeatedMisconception = key !== undefined && seen.has(key);
    if (key !== undefined) seen.add(key);
    return { ...base, result: 'WRONG', repeatedMisconception };
  });
}

/** 두 번 이상 고른 오개념. 처음 나온 표기로, 먼저 나온 것부터. */
export function repeatedMisconceptions(attempts: readonly AttemptRecord[]): string[] {
  const byKey = Map.groupBy(
    attempts.flatMap((a) => (a.misconception === null ? [] : [a.misconception])),
    normalizeAnswer,
  );
  return [...byKey.values()].flatMap((same) => (same.length >= 2 && same[0] !== undefined ? [same[0]] : []));
}
