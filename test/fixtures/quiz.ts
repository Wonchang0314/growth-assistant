/** 출제(QUIZ_GENERATION)·보기만 보고 풀기(QUIZ_VERIFICATION) 가짜 응답. `FakeClaudeClient.reply`에 넘긴다. */

export const multipleChoiceReply = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    keyPoint: '선택도가 낮으면 인덱스가 도움이 안 된다',
    difficulty: 2,
    prompt: '성별 컬럼에 인덱스를 걸어도 조회가 빨라지지 않는 이유는?',
    choices: [
      { text: '선택도가 낮아서', misconception: null },
      { text: '컬럼이 짧아서', misconception: '짧은 컬럼은 인덱스가 안 된다고 믿음' },
      { text: 'NULL이 많아서', misconception: 'NULL은 인덱스에 안 들어간다고 믿음' },
      { text: '정렬이 안 돼서', misconception: '문자열은 정렬되지 않는다고 믿음' },
    ],
    answer: '선택도가 낮아서',
    explanation: '해설',
    referenceMaterial: '근거',
    ...overrides,
  });

export const fillBlankReply = JSON.stringify({
  keyPoint: '선택도',
  difficulty: 1,
  prompt: '인덱스가 효과 있으려면 ____가 높아야 한다',
  answer: '선택도',
  acceptedAnswers: ['selectivity'],
  explanation: '해설',
  referenceMaterial: '근거',
});

/** 보기만 보고 풀기 응답. 기본은 1번(섞기를 고정하면 정답)을 단서 없이 짐작한 것이라 통과다. */
export const guessReply = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ choice: 1, cue: null, ...overrides });
