import { findLengthCue } from '../../../core/ingestion/case-gate.js';
import { BLANK, CHOICE_COUNT, type Choice, normalizeAnswer, type QuestionDraft } from './quiz-question.js';

/**
 * 출제 직후 코드가 보는 모양 검사. 걸린 이유를 돌려주고, 통과하면 빈 배열이다.
 * 출제에 경험을 싣지 않아 회사 맥락이 샐 곳이 없으므로 조직 문자열은 보지 않는다 (ADR-0041).
 */
export function draftProblems(draft: QuestionDraft): string[] {
  return [...typeProblems(draft), ...lengthProblems(draft)];
}

/** 질문 없이 보기만 본 검토자가 고른 보기와 그렇게 고른 단서. 단서 없이 짐작했으면 [cue]는 null이다. */
export interface ChoiceGuess {
  readonly answer: string;
  readonly cue: string | null;
}

/** 보기만 보고 단서로 정답을 골랐으면 걸린 이유. 짐작으로 맞힌 것은 넘긴다(보기 4개면 넷에 하나는 맞는다, ADR-0041). */
export const choiceGuessProblems = (answer: string, guess: ChoiceGuess): string[] =>
  guess.answer === answer && guess.cue !== null ? [`질문 없이 보기만 보고 정답을 고를 수 있다: ${guess.cue}`] : [];

/** 문제 길이 상한 (ADR-0038). 가볍게 풀 수 있게 질문은 두 문장, 보기는 한 줄로 둔다. 출제 프롬프트에도 싣는다. */
export const LENGTH_LIMITS = { promptChars: 150, promptSentences: 2, choiceChars: 40 } as const;

/** 글자 수. 화면에 보이는 글자 단위로 세어 한글 음절 하나가 한 글자다. 완성형 한글·영문이면 DB의 `char_length`와 같다. */
const graphemes = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const charCount = (text: string): number => [...graphemes.segment(text)].length;

/** 문장 수. 마침표·물음표·느낌표 뒤가 공백이나 끝이면 문장 끝으로 본다("3.5"의 점은 세지 않는다). */
const sentenceCount = (text: string): number =>
  text
    .trim()
    .split(/[.?!](?:\s+|$)/)
    .filter(Boolean).length;

function lengthProblems(draft: QuestionDraft): string[] {
  const { promptChars, promptSentences, choiceChars } = LENGTH_LIMITS;
  const problems: string[] = [];
  const chars = charCount(draft.prompt);
  if (chars > promptChars) problems.push(`질문이 길다(${chars}자). ${promptChars}자 안으로 줄인다`);
  const sentences = sentenceCount(draft.prompt);
  if (sentences > promptSentences) {
    problems.push(`질문이 ${sentences}문장이다. ${promptSentences}문장 안으로 줄인다`);
  }
  const long = draft.type === 'MULTIPLE_CHOICE' ? draft.choices.filter((c) => charCount(c.text) > choiceChars) : [];
  if (long.length > 0)
    problems.push(
      `보기가 길다(${long.map((c) => charCount(c.text)).join('·')}자). 보기마다 ${choiceChars}자 안으로 줄인다`,
    );
  return problems;
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
  if (!NUMBER.test(answer) && normalizeAnswer(prompt).includes(normalizeAnswer(answer))) {
    problems.push('문제 문장에 정답이 그대로 드러난다');
  }
  return problems;
}

/**
 * 숫자 답. 문장에 조건으로 나온 숫자("4코어", "60초")와 계산한 답이 같기 쉬워 글자 비교로는 드러났는지 알 수 없다.
 * 이때는 보지 않는다 (2026-10-18 시험에서 빈칸 2개가 이렇게 걸렸다).
 */
const NUMBER = /^\s*[\d.,]+\s*$/;

/** 보기 순서를 섞는다. 생성 모델이 정답을 앞쪽에 두는 버릇을 지운다. [random]은 [0, 1) 난수다. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((e) => e.item);
}
