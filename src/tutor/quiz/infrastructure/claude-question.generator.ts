import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeClient } from '../../../core/llm/claude.client.js';
import { listSection, loadPrompt } from '../../../core/llm/prompt.js';
import { type GenerationContext, QuestionGenerator } from '../application/ports.js';
import { type ChoiceGuess, LENGTH_LIMITS } from '../domain/question-gate.js';
import { BLANK, CHOICE_COUNT, type ConceptAngle, type QuestionDraft } from '../domain/quiz-question.js';
import type { QuestionHistory } from '../domain/variant.js';

/** 각도는 코드가 숙련도로 정한다 (ADR-0038). 프롬프트에 싣는 설명이다. */
const ANGLE_TEXT: Record<ConceptAngle, string> = {
  MECHANISM: '동작 원리(MECHANISM): 개념이 무엇이고 어떻게 동작하는지 짧게 확인한다. 처음 보거나 약한 개념이다',
  WHY: '왜(WHY): 그렇게 동작하거나 그렇게 설계한 이유를 묻는다',
  WHEN: '언제 쓰나(WHEN): 어떤 조건에서 쓰고 어떤 조건에서 피하는지 묻는다',
  TRADEOFF: '트레이드오프(TRADEOFF): 무엇을 얻고 잃는지, 조건이 부딪칠 때 어느 쪽을 고를지 설계 판단을 묻는다',
};

const common = {
  keyPoint: z.string().min(1).describe('이 문제가 확인하는 핵심 한 가지를 한 문장으로'),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe('1 기본, 2 응용, 3 심화'),
  explanation: z.string().min(1).describe('정답인 이유와 오답이 틀린 이유'),
  referenceMaterial: z.string().min(1).describe('정답의 근거가 되는 사실'),
};

const multipleChoiceSchema = z.object({
  ...common,
  prompt: z.string().min(1).describe('질문'),
  choices: z
    .array(
      z.object({
        text: z.string().min(1),
        misconception: z.string().nullable().describe('이 보기를 고르게 만드는 오개념. 정답 보기는 null'),
      }),
    )
    .describe(`보기 ${CHOICE_COUNT}개`),
  answer: z.string().min(1).describe('정답 보기의 text와 똑같이'),
});

const fillBlankSchema = z.object({
  ...common,
  prompt: z.string().min(1).describe(`빈칸 자리에 ${BLANK}를 한 번 넣은 문장`),
  answer: z.string().min(1).describe('빈칸에 들어갈 답'),
  acceptedAnswers: z.array(z.string().min(1)).describe('같은 답의 다른 표기(약어, 영문·한글)'),
});

const choiceGuessSchema = z.object({
  choice: z.number().int().describe('정답으로 보이는 보기 번호 (1부터)'),
  cue: z.string().nullable().describe('그 보기를 고른 단서. 뚜렷한 단서 없이 짐작했으면 null'),
});

const GENERATION_SYSTEM_PROMPT = loadPrompt(import.meta.dirname, 'quiz-generation');
const CHOICE_GUESS_SYSTEM_PROMPT = loadPrompt(import.meta.dirname, 'quiz-choice-guess');

/** 변형이면 원래 문제를 잇고 핵심을 그대로 쓴다. */
function variantFields(context: GenerationContext) {
  const original = context.variantOf?.question;
  return original ? { variantOf: original.id, keyPoint: original.keyPoint } : { variantOf: null };
}

/** 정답까지 담은 문제 글. 변형을 만들 때 원래 문제로 싣는다. */
function questionText(q: QuestionDraft): string {
  const body =
    q.type === 'MULTIPLE_CHOICE'
      ? `${q.prompt}\n${q.choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`
      : `${q.prompt}\n허용 답: ${[q.answer, ...q.acceptedAnswers].join(', ')}`;
  return `핵심: ${q.keyPoint}\n${body}\n정답: ${q.answer}`;
}

/** `claude -p`로 문제를 쓰고(Sonnet), 보기만 보여 줘서 정답을 짐작하게 한다(Haiku). */
@Injectable()
export class ClaudeQuestionGenerator extends QuestionGenerator {
  constructor(private readonly claude: ClaudeClient) {
    super();
  }

  /** 각도는 코드가 정한 것을 쓰고, 근거 경험 카드는 출제 서비스가 잇는다. */
  async write(context: GenerationContext, problems: readonly string[]): Promise<QuestionDraft> {
    const request = {
      purpose: 'QUIZ_GENERATION' as const,
      systemPrompt: GENERATION_SYSTEM_PROMPT,
      prompt: generationPrompt(context, problems),
    };
    const fixed = {
      ...variantFields(context),
      conceptId: context.concept.id,
      angle: context.angle,
      experienceId: null,
      caseId: null,
    };
    if (context.type === 'MULTIPLE_CHOICE') {
      const r = await this.claude.completeStructured(request, multipleChoiceSchema);
      return { ...r, ...fixed, type: 'MULTIPLE_CHOICE' };
    }
    const r = await this.claude.completeStructured(request, fillBlankSchema);
    return { ...r, ...fixed, type: 'FILL_BLANK' };
  }

  async guessFromChoices(choices: readonly string[]): Promise<ChoiceGuess> {
    const { choice, cue } = await this.claude.completeStructured(
      {
        purpose: 'QUIZ_VERIFICATION',
        systemPrompt: CHOICE_GUESS_SYSTEM_PROMPT,
        prompt: `## 보기\n${choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`,
      },
      choiceGuessSchema,
    );
    return { answer: choices[choice - 1] ?? `${choice}번(없는 보기)`, cue };
  }
}

function conceptSection({ concept }: GenerationContext): string {
  return [
    `## 개념: ${concept.name}`,
    `트랙: ${concept.track}`,
    `설명: ${concept.description}`,
    ...(concept.parent === null ? [] : [`상위 개념: ${concept.parent}`]),
    ...(concept.prerequisites.length === 0 ? [] : [`선수 개념: ${concept.prerequisites.join(', ')}`]),
  ].join('\n');
}

/** 새 문제면 이미 낸 핵심(겹치지 않게), 변형이면 원래 문제. */
const focusSection = (context: GenerationContext): string[] =>
  context.variantOf === null
    ? listSection('이미 낸 핵심 (이것과 다른 핵심을 묻는다)', context.knownKeyPoints)
    : [variantSection(context.variantOf)];

const { promptChars, promptSentences, choiceChars } = LENGTH_LIMITS;

export function generationPrompt(context: GenerationContext, problems: readonly string[]): string {
  return [
    conceptSection(context),
    `## 문제 유형\n${context.type === 'MULTIPLE_CHOICE' ? `객관식 (보기 ${CHOICE_COUNT}개)` : '빈칸'}`,
    `## 각도\n${ANGLE_TEXT[context.angle]}`,
    `## 길이\n질문은 ${promptSentences}문장, ${promptChars}자 안으로 쓴다.` +
      (context.type === 'MULTIPLE_CHOICE' ? ` 보기는 하나에 ${choiceChars}자 안으로 쓴다.` : ''),
    ...focusSection(context),
    ...listSection('사용자가 헷갈린 점', context.confusedPoints),
    ...listSection('출제 지침 (사용자 요청)', context.guideline),
    ...listSection('지난 문제의 문제', problems),
  ].join('\n\n');
}

function variantSection({ question, lastAnswer }: QuestionHistory): string {
  const answered =
    lastAnswer === null
      ? []
      : [
          `사용자의 답: ${lastAnswer.userAnswer} (${lastAnswer.correct ? '정답' : '오답'}, 확신도 ${lastAnswer.confidence}${lastAnswer.hintUsed ? ', 힌트 사용' : ''})`,
          ...(lastAnswer.misconception === null ? [] : [`그때 고른 오개념: ${lastAnswer.misconception}`]),
        ];
  return ['## 변형할 원래 문제 (같은 핵심을 다른 상황·조건으로 다시 묻는다)', questionText(question), ...answered].join(
    '\n',
  );
}
