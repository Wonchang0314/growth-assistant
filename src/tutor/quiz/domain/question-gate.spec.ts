import { describe, expect, it } from 'vitest';
import { draftProblems, shuffled } from './question-gate.js';
import { solutionProblems } from './question-solution.js';
import type { QuestionDraft } from './quiz-question.js';

const base = {
  conceptId: 1,
  angle: 'WHY',
  keyPoint: '선택도가 낮으면 인덱스가 도움이 안 된다',
  difficulty: 2,
  explanation: '해설',
  referenceMaterial: '근거',
  experienceId: null,
  variantOf: null,
  caseId: null,
} as const;

const choice = (text: string, misconception: string | null = `${text}라고 믿음`) => ({ text, misconception });
const multiple = (overrides: Partial<Extract<QuestionDraft, { type: 'MULTIPLE_CHOICE' }>> = {}): QuestionDraft => ({
  ...base,
  type: 'MULTIPLE_CHOICE',
  prompt: '성별 컬럼에 인덱스를 걸어도 조회가 빨라지지 않는 이유는?',
  choices: [
    choice('선택도가 낮아서', null),
    choice('컬럼이 짧아서'),
    choice('NULL이 많아서'),
    choice('정렬이 안 돼서'),
  ],
  answer: '선택도가 낮아서',
  ...overrides,
});
const blank = (prompt: string, answer = '선택도'): QuestionDraft => ({
  ...base,
  type: 'FILL_BLANK',
  prompt,
  answer,
  acceptedAnswers: ['selectivity'],
});

describe('draftProblems', () => {
  it('모양이 맞으면 통과한다', () => {
    expect(draftProblems(multiple())).toEqual([]);
    expect(draftProblems(blank('인덱스가 효과 있으려면 ____가 높아야 한다'))).toEqual([]);
  });

  it('숫자 답은 문장의 다른 숫자에 들어 있어도 드러났다고 보지 않는다', () => {
    // "4코어"의 4와 계산한 답 4는 다른 값이다. 답이 드러났는지는 풀이 검증이 본다.
    expect(draftProblems(blank('4코어 호스트에서 스레드 8개가 돌면 약 ____ 코어를 쓴다', '4'))).toEqual([]);
  });

  it.each([
    [
      '보기가 3개',
      multiple({ choices: [choice('선택도가 낮아서', null), choice('컬럼이 짧아서'), choice('NULL이 많아서')] }),
      /보기는 4개/,
    ],
    [
      '같은 보기',
      multiple({ choices: [choice('선택도가 낮아서', null), choice('A'), choice('A '), choice('B')] }),
      /같은 보기/,
    ],
    ['answer가 정답 보기와 다름', multiple({ answer: '컬럼이 짧아서' }), /정답 보기/],
    [
      '정답 보기만 긺',
      multiple({
        choices: [
          choice('선택도가 낮아 인덱스를 타도 거의 모든 행을 읽어야 해서', null),
          choice('짧아서'),
          choice('NULL'),
          choice('정렬'),
        ],
        answer: '선택도가 낮아 인덱스를 타도 거의 모든 행을 읽어야 해서',
      }),
      /정답 보기만 눈에 띄게 길다/,
    ],
    ['회사 테이블 이름', multiple({ prompt: 'CUSTOMER_EXT 테이블에서 성별로 찾을 때 느린 이유는?' }), /CUSTOMER_EXT/],
    ['빈칸 없음', blank('인덱스가 효과 있으려면 선택도가 높아야 한다', '높아야'), /빈칸\(____\)/],
    ['빈칸 둘', blank('____가 높으면 ____가 빨라진다'), /정확히 하나/],
    ['정답이 문장에 드러남', blank('선택도는 ____ 비율이다. 선택도가 높아야 한다'), /정답이 그대로/],
  ] as const)('%s → 걸린다', (_, draft, problem) => {
    expect(draftProblems(draft).join('\n')).toMatch(problem);
  });
});

describe('solutionProblems', () => {
  it('검토자가 정답을 고르고 문제를 말하지 않으면 통과한다', () => {
    expect(solutionProblems(multiple(), { answer: '선택도가 낮아서', singleAnswer: true, problems: [] })).toEqual([]);
  });

  it('빈칸은 허용 답과 표기 차이(대소문자·공백·전각)를 무시하고 비교한다', () => {
    const draft = blank('인덱스가 효과 있으려면 ____가 높아야 한다');

    expect(solutionProblems(draft, { answer: 'ＳＥＬＥＣＴＩＶＩＴＹ ', singleAnswer: true, problems: [] })).toEqual(
      [],
    );
    expect(solutionProblems(draft, { answer: '카디널리티', singleAnswer: true, problems: [] })[0]).toMatch(
      /"카디널리티"라고 답했다/,
    );
  });

  it('다른 답, 정답이 여럿, 검토자가 말한 문제를 모두 이유로 남긴다', () => {
    expect(
      solutionProblems(multiple(), { answer: '컬럼이 짧아서', singleAnswer: false, problems: ['조건이 모자라다'] }),
    ).toEqual([
      '정답을 모르고 푼 검토자가 "컬럼이 짧아서"를 골랐다',
      '정답이 하나로 정해지지 않는다',
      '조건이 모자라다',
    ]);
  });
});

describe('shuffled', () => {
  it('난수 순서대로 섞고 원래 배열은 두고 모든 항목을 남긴다', () => {
    const keys = [0.9, 0.1, 0.5];
    const items = ['a', 'b', 'c'];

    expect(shuffled(items, () => keys.shift() ?? 0)).toEqual(['b', 'c', 'a']);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
