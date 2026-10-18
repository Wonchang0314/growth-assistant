import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock, localDate } from '../../../../core/clock/clock.js';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../../core/mcp/mcp-tool.js';
import { CONFIDENCES, weaknessLevel } from '../../../mastery/mastery.js';
import { QuizGradingService } from '../../application/quiz-grading.service.js';

const input = z.object({
  questionId: z.number().int().positive().describe('get_review_set이 돌려준 문제 번호'),
  answer: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('사용자의 답. 객관식은 고른 보기 번호(예: "2"), 빈칸은 쓴 말 그대로'),
  confidence: z
    .enum(CONFIDENCES)
    .default('UNSURE')
    .describe('답한 뒤 물어본 확신도. SURE 확실, UNSURE 애매, GUESS 찍음. 묻지 못했으면 비운다(애매로 처리)'),
  hintUsed: z
    .boolean()
    .default(true)
    .describe('답하기 전에 힌트나 설명을 줬으면 true. 비우면 힌트를 쓴 것으로 보고 숙련도에 반영하지 않는다'),
});

const EXPERIENCE_TEXT = { LIVED: '이 원칙을 실제로 겪은 경험', SAME_CONCEPT: '같은 개념을 다룬 내 경험' } as const;
const LEVEL_TEXT = { UNMEASURED: '미측정', WEAK: '약점', OK: '양호' } as const;

@McpTool()
@Injectable()
export class SubmitAnswerTool implements McpToolHandler<typeof input> {
  readonly name = 'submit_answer';
  readonly description =
    'get_review_set으로 낸 문제의 답을 채점하고 숙련도와 다음 복습일을 갱신한다. ' +
    '사용자가 답하면 확신도(확실·애매·찍음)를 물은 뒤 부른다. 결과의 정오·해설·오개념을 바탕으로 설명을 이어 간다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(
    private readonly grading: QuizGradingService,
    private readonly clock: Clock,
  ) {}

  async handle(args: z.output<typeof input>): Promise<McpToolResult> {
    const r = await this.grading.submit(args);
    switch (r.kind) {
      case 'UNKNOWN_QUESTION':
        throw new Error(`없는 문제 번호다: ${args.questionId}`);
      case 'UNREADABLE_ANSWER':
        throw new Error(`어느 보기인지 알 수 없다: "${args.answer}". 보기 번호로 다시 보낸다`);
      case 'GRADED': {
        const lines = [
          `${r.correct ? '정답' : '오답'} (문제 ${r.question.id})`,
          `정답: ${r.correctAnswer}`,
          ...(r.correct ? [] : [`사용자 답: ${r.userAnswer}`]),
          ...(r.misconception === null ? [] : [`고른 보기의 오개념: ${r.misconception}`]),
          `해설: ${r.question.explanation}`,
          `근거: ${r.question.referenceMaterial}`,
          ...(r.experience === null ? [] : [`${EXPERIENCE_TEXT[r.experience.relation]}: ${r.experience.title}`]),
          r.mastery === null
            ? '신고된 문제라 숙련도에 반영하지 않았다'
            : `숙련도 ${r.mastery.masteryScore.toFixed(2)} (${LEVEL_TEXT[weaknessLevel(r.mastery)]}), 다음 복습 ${localDate(r.mastery.dueAt, this.clock.timeZone)}${args.hintUsed ? ' (힌트를 써서 점수에는 반영하지 않음)' : ''}`,
        ];
        return {
          text: lines.join('\n'),
          data: {
            correct: r.correct,
            correctAnswer: r.correctAnswer,
            misconception: r.misconception,
            explanation: r.question.explanation,
            experience: r.experience,
            nextReview: r.mastery === null ? null : localDate(r.mastery.dueAt, this.clock.timeZone),
          },
        };
      }
      default: {
        const _exhaustive: never = r;
        return _exhaustive;
      }
    }
  }
}
