import { describe, expect, it } from 'vitest';
import { type AttemptRecord, grade, repeatedMisconceptions, toGradedAnswers } from './grading.js';
import type { Question } from './quiz-question.js';

const base = {
  id: 1,
  conceptId: 1,
  angle: 'WHY',
  keyPoint: '핵심',
  difficulty: 1,
  explanation: '해설',
  referenceMaterial: '근거',
  experienceId: null,
  variantOf: null,
  caseId: null,
  reported: false,
} as const;

const multiple: Question = {
  ...base,
  type: 'MULTIPLE_CHOICE',
  prompt: '질문',
  choices: [
    { text: '컬럼이 짧아서', misconception: '짧으면 안 된다고 믿음' },
    { text: '선택도가 낮아서', misconception: null },
  ],
  answer: '선택도가 낮아서',
};
const blank: Question = {
  ...base,
  type: 'FILL_BLANK',
  prompt: '____가 높아야 한다',
  answer: '선택도',
  acceptedAnswers: ['selectivity'],
};

describe('grade', () => {
  it.each([
    ['보기 번호', '2', true],
    ['"번"이 붙은 번호', ' 2번 ', true],
    ['보기 글', '선택도가 낮아서', true],
    ['오답 번호', '1', false],
  ])('객관식 %s', (_, answer, correct) => {
    expect(grade(multiple, answer)?.correct).toBe(correct);
  });

  it('객관식 오답은 고른 보기의 글과 오개념을 남긴다', () => {
    expect(grade(multiple, '1')).toEqual({
      correct: false,
      userAnswer: '컬럼이 짧아서',
      misconception: '짧으면 안 된다고 믿음',
    });
  });

  it.each(['5', '세 번째', ''])('어느 보기인지 모르면 undefined: "%s"', (answer) => {
    expect(grade(multiple, answer)).toBeUndefined();
  });

  it('빈칸은 허용 답과 표기 차이를 무시하고 비교한다', () => {
    expect(grade(blank, ' Selectivity ')).toEqual({ correct: true, userAnswer: 'Selectivity', misconception: null });
    expect(grade(blank, '카디널리티')?.correct).toBe(false);
  });

  it.each([
    ['한글(영문)', '선택도(selectivity)', true],
    ['영문(한글)', 'Selectivity (선택도)', true],
    ['괄호 안만 맞음', '카디널리티(selectivity)', true],
    ['둘 다 틀림', '카디널리티(cardinality)', false],
  ])('빈칸에 "A(B)"로 답하면 A나 B 중 하나가 맞으면 정답이다: %s', (_, answer, correct) => {
    expect(grade(blank, answer)?.correct).toBe(correct);
  });
});

describe('repeatedMisconceptions', () => {
  it('두 번 이상 고른 오개념만 처음 표기로 돌려준다', () => {
    const at = new Date('2026-10-18T00:00:00Z');
    const attempt = (misconception: string | null) => ({
      conceptId: 1,
      correct: misconception === null,
      confidence: 'SURE' as const,
      hintUsed: false,
      misconception,
      answeredAt: at,
    });

    expect(
      repeatedMisconceptions([attempt('A라고 믿음'), attempt(null), attempt('B'), attempt('A 라고 믿음')]),
    ).toEqual(['A라고 믿음']);
  });
});

describe('toGradedAnswers', () => {
  const at = new Date('2026-10-18T00:00:00Z');
  const attempt = (correct: boolean, misconception: string | null = null): AttemptRecord => ({
    conceptId: 1,
    correct,
    confidence: 'SURE',
    hintUsed: false,
    misconception,
    answeredAt: at,
  });

  it('같은 오개념이 두 번째 나온 오답부터 반복 오개념이다', () => {
    const answers = toGradedAnswers([
      attempt(false, '짧으면 안 된다고 믿음'),
      attempt(true),
      attempt(false, '다른 오개념'),
      attempt(false, '짧으면  안 된다고 믿음'),
      attempt(false),
    ]);

    expect(answers.map((a) => (a.result === 'WRONG' ? a.repeatedMisconception : 'CORRECT'))).toEqual([
      false,
      'CORRECT',
      false,
      true,
      false,
    ]);
  });
});
