import { describe, expect, it } from 'vitest';
import type { Question } from './quiz-question.js';
import {
  answerStatus,
  type LastAnswer,
  nextQuestion,
  type QuestionHistory,
  variantCheckProblems,
  variantProblems,
} from './variant.js';

const question = (id: number, overrides: Partial<Extract<Question, { type: 'MULTIPLE_CHOICE' }>> = {}): Question => ({
  id,
  conceptId: 1,
  type: 'MULTIPLE_CHOICE',
  angle: 'WHY',
  keyPoint: '선택도',
  difficulty: 1,
  prompt: `질문 ${id}`,
  choices: [
    { text: '선택도가 낮아서', misconception: null },
    { text: '컬럼이 짧아서', misconception: '짧으면 안 된다고 믿음' },
  ],
  answer: '선택도가 낮아서',
  explanation: '해설',
  referenceMaterial: '근거',
  experienceId: null,
  variantOf: null,
  reported: false,
  ...overrides,
});

const answer = (overrides: Partial<LastAnswer> = {}): LastAnswer => ({
  correct: true,
  confidence: 'SURE',
  hintUsed: false,
  userAnswer: '선택도가 낮아서',
  misconception: null,
  ...overrides,
});

const history = (
  id: number,
  lastAnswer: LastAnswer | null,
  extra: { hasVariant?: boolean; variantOf?: number } = {},
): QuestionHistory => ({
  question: question(id, { variantOf: extra.variantOf ?? null }),
  lastAnswer,
  hasVariant: extra.hasVariant ?? false,
});

describe('answerStatus', () => {
  it.each([
    ['안 풂', null, 'UNANSWERED'],
    ['확실·애매하게 맞힘', answer({ confidence: 'UNSURE' }), 'CONFIRMED'],
    ['틀림', answer({ correct: false }), 'SHAKY'],
    ['찍어서 맞힘', answer({ confidence: 'GUESS' }), 'SHAKY'],
    ['힌트 쓰고 맞힘', answer({ hintUsed: true }), 'SHAKY'],
  ] as const)('%s → %s', (_, last, status) => {
    expect(answerStatus(last)).toBe(status);
  });
});

describe('nextQuestion', () => {
  it('흔들린 문제 중 변형이 없는 가장 오래된 것의 변형을 먼저 만든다', () => {
    const next = nextQuestion([
      history(1, answer({ correct: false }), { hasVariant: true }),
      history(2, answer()),
      history(3, answer({ confidence: 'GUESS' })),
    ]);

    expect(next.kind === 'VARIANT' && next.of.question.id).toBe(3);
  });

  it('흔들린 문제가 없으면 확인된 핵심의 변형과 새 핵심을 번갈아 만든다', () => {
    expect(nextQuestion([history(1, answer())]).kind).toBe('VARIANT');
    expect(nextQuestion([history(1, answer(), { hasVariant: true }), history(2, null, { variantOf: 1 })]).kind).toBe(
      'NEW',
    );
    expect(nextQuestion([]).kind).toBe('NEW');
    expect(nextQuestion([history(1, null)]).kind).toBe('NEW');
  });
});

describe('variantProblems', () => {
  it('질문·보기·정답 보기가 원래 문제와 같으면 걸린다', () => {
    expect(variantProblems(question(1), question(2, { prompt: '질문 1' }))).toEqual([
      '질문이 원래 문제와 같다',
      '보기가 원래 문제와 같다',
      '정답 보기가 원래 문제와 같다. 원래 답을 외워서 풀 수 있다',
    ]);
  });

  it('상황과 보기를 바꾸면 통과한다', () => {
    const variant = question(2, {
      prompt: '예약 상태 컬럼으로 찾을 때 느린 이유는?',
      choices: [
        { text: '거의 모든 행이 같은 값이라서', misconception: null },
        { text: '문자열 컬럼이라서', misconception: '문자열은 인덱스를 못 탄다고 믿음' },
      ],
      answer: '거의 모든 행이 같은 값이라서',
    });

    expect(variantProblems(question(1), variant)).toEqual([]);
  });
});

describe('variantCheckProblems', () => {
  it('다른 핵심이거나 외워서 풀 수 있으면 이유를 남긴다', () => {
    expect(
      variantCheckProblems({ sameKeyPoint: false, solvableByMemory: true, problems: ['정답 문장이 같다'] }),
    ).toEqual(['원래 문제와 다른 핵심을 묻는다', '원래 문제의 답을 기억하면 그대로 풀 수 있다', '정답 문장이 같다']);
    expect(variantCheckProblems({ sameKeyPoint: true, solvableByMemory: false, problems: [] })).toEqual([]);
  });
});
