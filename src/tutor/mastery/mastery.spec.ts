import { describe, expect, it } from 'vitest';
import { applyAnswer, gradeOf, newMastery, weaknessLevel, type ConceptMastery, type GradedAnswer } from './mastery.js';

const t0 = new Date('2026-10-18T00:00:00Z');

const correct = (confidence: GradedAnswer['confidence'], hintUsed = false): GradedAnswer => ({
  conceptId: 1,
  confidence,
  hintUsed,
  answeredAt: t0,
  result: 'CORRECT',
});
const wrong = (confidence: GradedAnswer['confidence'], repeatedMisconception = false): GradedAnswer => ({
  conceptId: 1,
  confidence,
  hintUsed: false,
  answeredAt: t0,
  result: 'WRONG',
  repeatedMisconception,
});

const answerAll = (answers: readonly GradedAnswer[]): ConceptMastery => answers.reduce(applyAnswer, newMastery(1, t0));

describe('gradeOf', () => {
  it.each([
    ['오답(확실)', wrong('SURE'), 'AGAIN'],
    ['정답 + 찍음', correct('GUESS'), 'HARD'],
    ['정답 + 확실 + 힌트', correct('SURE', true), 'HARD'],
    ['정답 + 애매', correct('UNSURE'), 'GOOD'],
    ['정답 + 확실', correct('SURE'), 'EASY'],
  ] as const)('%s → %s', (_, answer, grade) => {
    expect(gradeOf(answer)).toBe(grade);
  });
});

describe('applyAnswer', () => {
  it('첫 응답은 점수를 그 값으로 시작하고 일정을 함께 갱신한다', () => {
    const m = answerAll([correct('SURE')]);

    expect(m).toMatchObject({ masteryScore: 1, weaknessScore: 0, gradedAttempts: 1, state: 'REVIEW', reps: 1 });
  });

  it('힌트를 쓴 응답은 일정만 바꾸고 점수와 채점 수는 그대로 둔다', () => {
    const m = answerAll([correct('SURE'), correct('SURE', true)]);

    expect(m).toMatchObject({ masteryScore: 1, weaknessScore: 0, gradedAttempts: 1, reps: 2 });
  });

  it.each([
    ['확실하게', correct('SURE'), 1],
    ['애매하게', correct('UNSURE'), 0.5],
    ['찍어서', correct('GUESS'), 0],
  ] as const)('%s 맞힌 답은 %d점이다', (_, answer, credit) => {
    expect(answerAll([answer])).toMatchObject({ masteryScore: credit, weaknessScore: 1 - credit });
  });

  it('최근 응답에 0.4 가중치를 둔 이동평균이다', () => {
    const m = answerAll([correct('SURE'), wrong('UNSURE')]);

    expect(m.masteryScore).toBeCloseTo(0.6);
    expect(m.weaknessScore).toBeCloseTo(0.4);
  });

  it.each([
    ['애매하게 틀림', wrong('UNSURE'), 0.4],
    ['확신했는데 틀림', wrong('SURE'), 0.6],
    ['같은 오개념 반복', wrong('UNSURE', true), 0.6],
    ['확신했는데 같은 오개념 반복', wrong('SURE', true), 0.8],
  ] as const)('%s → 맞힌 다음 약점 %d', (_, answer, weakness) => {
    const m = answerAll([correct('SURE'), answer]);

    expect(m.masteryScore).toBeCloseTo(0.6);
    expect(m.weaknessScore).toBeCloseTo(weakness);
  });

  it('약점 점수는 1을 넘지 않는다', () => {
    expect(answerAll([wrong('SURE', true)]).weaknessScore).toBe(1);
  });
});

describe('weaknessLevel', () => {
  it.each([
    [1, 1, 'UNMEASURED'],
    [2, 0.5, 'WEAK'],
    [2, 0.49, 'OK'],
  ] as const)('채점 %i회, 약점 %d → %s', (gradedAttempts, weaknessScore, level) => {
    expect(weaknessLevel({ gradedAttempts, weaknessScore })).toBe(level);
  });
});
