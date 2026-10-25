import { describe, expect, it } from 'vitest';
import { choiceGuessProblems, draftProblems, shuffled } from './question-gate.js';
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
    // "4코어"의 4와 계산한 답 4는 다른 값이다.
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
    ['빈칸 없음', blank('인덱스가 효과 있으려면 선택도가 높아야 한다', '높아야'), /빈칸\(____\)/],
    ['빈칸 둘', blank('____가 높으면 ____가 빨라진다'), /정확히 하나/],
    ['정답이 문장에 드러남', blank('선택도는 ____ 비율이다. 선택도가 높아야 한다'), /정답이 그대로/],
    ['질문 151자', multiple({ prompt: `${'가'.repeat(150)}?` }), /질문이 길다\(151자\)/],
    ['질문 세 문장', multiple({ prompt: '테이블이 크다. 쓰기가 잦다. 인덱스를 더할까?' }), /질문이 3문장이다/],
    [
      '보기 41자',
      multiple({ choices: [choice('선택도가 낮아서', null), choice('가'.repeat(41)), choice('B'), choice('C')] }),
      /보기가 길다\(41자\)/,
    ],
  ] as const)('%s → 걸린다', (_, draft, problem) => {
    expect(draftProblems(draft).join('\n')).toMatch(problem);
  });

  it('질문 150자·두 문장, 보기 40자까지는 통과하고 소수점은 문장 끝으로 세지 않는다', () => {
    const long = '나'.repeat(40);
    const draft = multiple({
      prompt: `${'가'.repeat(127)} 응답이 3.5초 걸린다. 무엇부터 볼까?`,
      choices: [choice(long, null), choice('다'.repeat(40)), choice('라'.repeat(40)), choice('마'.repeat(40))],
      answer: long,
    });

    expect(draft.prompt).toHaveLength(150);
    expect(draftProblems(draft)).toEqual([]);
  });
});

describe('choiceGuessProblems', () => {
  it('보기만 보고 단서로 정답을 고르면 그 단서를 이유로 남긴다', () => {
    expect(choiceGuessProblems('선택도가 낮아서', { answer: '선택도가 낮아서', cue: '1번만 이유가 다르다' })).toEqual([
      '질문 없이 보기만 보고 정답을 고를 수 있다: 1번만 이유가 다르다',
    ]);
  });

  it.each([
    ['단서 없이 짐작해 맞힘', { answer: '선택도가 낮아서', cue: null }],
    ['단서를 댔지만 오답을 고름', { answer: '컬럼이 짧아서', cue: '2번만 짧다' }],
  ])('%s → 통과한다', (_, guess) => {
    expect(choiceGuessProblems('선택도가 낮아서', guess)).toEqual([]);
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
