import { findLeaks, findLengthCue } from '../../../core/ingestion/case-gate.js';
import { BLANK, CHOICE_COUNT, type Choice, normalizeAnswer, type QuestionDraft } from './quiz-question.js';

/**
 * 출제 직후 코드가 보는 모양 검사. 걸린 이유를 돌려주고, 통과하면 빈 배열이다.
 * 내용(정답이 하나뿐인지, 풀 수 있는지)은 정답을 숨긴 검증 호출이 본다.
 */
export function draftProblems(draft: QuestionDraft): string[] {
  const leaks = findLeaks(questionText(draft));
  return [
    ...typeProblems(draft),
    ...(leaks.length === 0 ? [] : [`특정 조직을 가리킬 수 있는 문자열이 있다: ${leaks.join(', ')}`]),
  ];
}

function typeProblems(draft: QuestionDraft): string[] {
  switch (draft.type) {
    case 'MULTIPLE_CHOICE':
      return choiceProblems(draft.choices, draft.answer);
    case 'FILL_BLANK':
      return blankProblems(draft.prompt, draft.answer);
    default: {
      const _exhaustive: never = draft;
      return _exhaustive;
    }
  }
}

/** 사용자에게 보이는 모든 글. 경험 카드의 회사 맥락이 새지 않았는지 패턴 게이트(ADR-0024)로 본다. */
const questionText = (draft: QuestionDraft) =>
  [
    draft.prompt,
    draft.explanation,
    draft.referenceMaterial,
    ...(draft.type === 'MULTIPLE_CHOICE'
      ? draft.choices.flatMap((c) => [c.text, c.misconception ?? ''])
      : [draft.answer, ...draft.acceptedAnswers]),
  ].join('\n');

function choiceProblems(choices: readonly Choice[], answer: string): string[] {
  const problems: string[] = [];
  if (choices.length !== CHOICE_COUNT) problems.push(`보기는 ${CHOICE_COUNT}개여야 한다(지금 ${choices.length}개)`);
  if (new Set(choices.map((c) => normalizeAnswer(c.text))).size !== choices.length) {
    problems.push('같은 보기가 두 번 있다');
  }
  const correct = choices.filter((c) => c.misconception === null);
  if (correct.length !== 1 || correct[0]?.text !== answer) {
    problems.push('정답 보기(misconception이 null)가 하나뿐이고 그 글이 answer와 같아야 한다');
  }
  if (choices.some((c) => c.misconception?.trim() === '')) problems.push('오답 보기마다 오개념을 써야 한다');
  const cue = findLengthCue(choices.map((c) => ({ text: c.text, chosen: c.misconception === null })));
  if (cue) {
    problems.push(
      `정답 보기만 눈에 띄게 길다(${cue.chosen}자, 가장 긴 오답 ${cue.longestOther}자). 보기 길이와 세부 수준을 맞춘다`,
    );
  }
  return problems;
}

function blankProblems(prompt: string, answer: string): string[] {
  const problems: string[] = [];
  const blanks = prompt.split(BLANK).length - 1;
  if (blanks !== 1) problems.push(`문제 문장에 빈칸(${BLANK})이 정확히 하나 있어야 한다(지금 ${blanks}개)`);
  if (normalizeAnswer(prompt).includes(normalizeAnswer(answer))) problems.push('문제 문장에 정답이 그대로 드러난다');
  return problems;
}

/** 보기 순서를 섞는다. 생성 모델이 정답을 앞쪽에 두는 버릇을 지운다. [random]은 [0, 1) 난수다. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((e) => e.item);
}
