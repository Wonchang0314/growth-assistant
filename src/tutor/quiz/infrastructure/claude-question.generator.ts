import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ClaudeClient } from '../../../core/llm/claude.client.js';
import { listSection, loadPrompt } from '../../../core/llm/prompt.js';
import { type GenerationContext, QuestionGenerator } from '../application/ports.js';
import type { Solution } from '../domain/question-solution.js';
import { BLANK, CHOICE_COUNT, CONCEPT_ANGLES, type Question, type QuestionDraft } from '../domain/quiz-question.js';
import type { QuestionHistory, VariantCheck } from '../domain/variant.js';

const common = {
  angle: z.enum(CONCEPT_ANGLES).describe('WHY: 왜, WHEN: 언제 쓰나, TRADEOFF: 무엇을 얻고 잃나, MECHANISM: 동작 원리'),
  keyPoint: z.string().min(1).describe('이 문제가 확인하는 핵심 한 가지를 한 문장으로'),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).describe('1 기본, 2 응용, 3 심화'),
  explanation: z.string().min(1).describe('정답인 이유와 오답이 틀린 이유'),
  referenceMaterial: z.string().min(1).describe('정답의 근거가 되는 사실. 출처가 경험 카드면 카드 id를 밝힌다'),
  experienceId: z.number().int().nullable().describe('문제의 근거로 쓴 경험 카드 id. 없으면 null'),
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

const solutionFields = {
  singleAnswer: z.boolean().describe('정답이 하나로 정해지는가'),
  problems: z.array(z.string()).describe('문제에서 고칠 점. 한 항목에 하나씩. 없으면 빈 배열'),
};
const choiceSolutionSchema = z.object({
  choice: z.number().int().describe('고른 보기 번호 (1부터)'),
  ...solutionFields,
});
const blankSolutionSchema = z.object({ answer: z.string().describe('빈칸에 들어갈 답'), ...solutionFields });

const variantCheckSchema = z.object({
  sameKeyPoint: z.boolean().describe('변형 문제가 원래 문제와 같은 핵심을 묻는가'),
  solvableByMemory: z.boolean().describe('원래 문제의 답을 기억하는 것만으로 변형 문제를 풀 수 있는가'),
  problems: z.array(z.string()).describe('고칠 점. 한 항목에 하나씩. 없으면 빈 배열'),
});

const GENERATION_SYSTEM_PROMPT = loadPrompt(import.meta.dirname, 'quiz-generation');
const VERIFICATION_SYSTEM_PROMPT = loadPrompt(import.meta.dirname, 'quiz-verification');
const VARIANT_CHECK_SYSTEM_PROMPT = loadPrompt(import.meta.dirname, 'quiz-variant-check');

/** 정답까지 담은 문제 글. 변형을 만들거나 원래 문제와 비교할 때 쓴다. */
function questionText(q: QuestionDraft): string {
  const body =
    q.type === 'MULTIPLE_CHOICE'
      ? `${q.prompt}\n${q.choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}`
      : `${q.prompt}\n허용 답: ${[q.answer, ...q.acceptedAnswers].join(', ')}`;
  return `핵심: ${q.keyPoint}\n${body}\n정답: ${q.answer}`;
}

/** `claude -p`로 문제를 쓰고(Sonnet), 정답을 숨겨 풀게 한다(Opus). */
@Injectable()
export class ClaudeQuestionGenerator extends QuestionGenerator {
  constructor(private readonly claude: ClaudeClient) {
    super();
  }

  async write(context: GenerationContext, problems: readonly string[]): Promise<QuestionDraft> {
    const request = {
      purpose: 'QUIZ_GENERATION' as const,
      systemPrompt: GENERATION_SYSTEM_PROMPT,
      prompt: generationPrompt(context, problems),
    };
    // 주지 않은 카드 id를 쓰면 근거 카드가 없는 것으로 본다.
    const experienceId = (id: number | null) => (context.experiences.some((e) => e.id === id) ? id : null);
    const original = context.variantOf?.question;
    // 변형은 원래 문제의 핵심을 그대로 쓴다.
    const fixed = original ? { variantOf: original.id, keyPoint: original.keyPoint } : { variantOf: null };
    const base = { conceptId: context.concept.id };
    if (context.type === 'MULTIPLE_CHOICE') {
      const r = await this.claude.completeStructured(request, multipleChoiceSchema);
      return { ...base, ...r, ...fixed, type: 'MULTIPLE_CHOICE', experienceId: experienceId(r.experienceId) };
    }
    const r = await this.claude.completeStructured(request, fillBlankSchema);
    return { ...base, ...r, ...fixed, type: 'FILL_BLANK', experienceId: experienceId(r.experienceId) };
  }

  compareVariant(original: Question, variant: QuestionDraft): Promise<VariantCheck> {
    return this.claude.completeStructured(
      {
        purpose: 'QUIZ_VERIFICATION',
        systemPrompt: VARIANT_CHECK_SYSTEM_PROMPT,
        prompt: [`## 원래 문제\n${questionText(original)}`, `## 변형 문제\n${questionText(variant)}`].join('\n\n'),
      },
      variantCheckSchema,
    );
  }

  async solve(draft: QuestionDraft): Promise<Solution> {
    const request = { purpose: 'QUIZ_VERIFICATION' as const, systemPrompt: VERIFICATION_SYSTEM_PROMPT };
    if (draft.type === 'FILL_BLANK') {
      return this.claude.completeStructured(
        { ...request, prompt: `## 문제 (빈칸)\n${draft.prompt}` },
        blankSolutionSchema,
      );
    }
    const choices = draft.choices.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
    const { choice, ...rest } = await this.claude.completeStructured(
      { ...request, prompt: `## 문제 (객관식)\n${draft.prompt}\n\n## 보기\n${choices}` },
      choiceSolutionSchema,
    );
    return { ...rest, answer: draft.choices[choice - 1]?.text ?? `${choice}번(없는 보기)` };
  }
}

export function generationPrompt(context: GenerationContext, problems: readonly string[]): string {
  const { concept } = context;
  return [
    [
      `## 개념: ${concept.name}`,
      `트랙: ${concept.track}`,
      `설명: ${concept.description}`,
      ...(concept.parent === null ? [] : [`상위 개념: ${concept.parent}`]),
      ...(concept.prerequisites.length === 0 ? [] : [`선수 개념: ${concept.prerequisites.join(', ')}`]),
    ].join('\n'),
    `## 문제 유형\n${context.type === 'MULTIPLE_CHOICE' ? `객관식 (보기 ${CHOICE_COUNT}개)` : '빈칸'}`,
    ...(context.variantOf === null
      ? listSection('이미 낸 핵심 (이것과 다른 핵심을 묻는다)', context.knownKeyPoints)
      : [variantSection(context.variantOf)]),
    ...listSection('사용자가 헷갈린 점', context.confusedPoints),
    ...(context.experiences.length === 0
      ? []
      : [
          `## 관련 경험 카드\n${context.experiences
            .map((e) =>
              [
                `### id ${e.id}: ${e.title}`,
                `상황: ${e.situation}`,
                `행동: ${e.action}`,
                `결과: ${e.result}`,
                `교훈: ${e.lesson}`,
              ].join('\n'),
            )
            .join('\n\n')}`,
        ]),
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
  return [
    '## 변형할 원래 문제 (같은 핵심을 다른 상황·조건·각도로 다시 묻는다)',
    questionText(question),
    ...answered,
  ].join('\n');
}
