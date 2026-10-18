import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../../core/mcp/mcp-tool.js';
import { QuizReviewService, type ServedQuestion } from '../../application/quiz-review.service.js';
import { DAILY_LIMIT } from '../../domain/review-selection.js';

const input = z.object({
  concept: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .describe('사용자가 특정 개념 문제를 원하면 그 개념 이름. "복습하자"처럼 고르지 않았으면 비운다'),
  count: z.number().int().min(1).max(DAILY_LIMIT).optional().describe('문제 수. 사용자가 말하지 않았으면 비운다'),
});

@McpTool()
@Injectable()
export class GetReviewSetTool implements McpToolHandler<typeof input> {
  readonly name = 'get_review_set';
  readonly description =
    '복습할 퀴즈 문제(객관식·빈칸)를 가져온다. 사용자가 "복습하자", "문제 내줘", "OO 문제 내줘"라고 하면 부른다. ' +
    '개념을 고르지 않으면 복습할 때가 된 개념, 헷갈렸던 개념, 약점, 새 개념 순으로 하루 10문제 안에서 고른다. ' +
    '정답은 돌려주지 않는다. 문제를 한 번에 하나씩 내고, 답을 들으면 확신도를 물은 뒤 submit_answer로 채점한다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly review: QuizReviewService) {}

  async handle(args: z.output<typeof input>): Promise<McpToolResult> {
    const set = await this.review.reviewSet(args);
    switch (set.kind) {
      case 'UNKNOWN_CONCEPT':
        return { text: `개념 목록에 없다: ${set.name}`, data: { questions: [] } };
      case 'DAILY_LIMIT_REACHED':
        return { text: `오늘 복습 ${DAILY_LIMIT}문제를 다 풀었다. 내일 이어서 한다.`, data: { questions: [] } };
      case 'READY': {
        const lines = [
          set.questions.length === 0 ? '지금 낼 문제가 없다' : set.questions.map(describe).join('\n\n'),
          ...(set.preparing.length === 0
            ? []
            : [`문제를 만드는 중(1~2분 걸림, 다시 부르면 나옴): ${set.preparing.join(', ')}`]),
          ...(set.remainingToday === null ? [] : [`오늘 더 풀 수 있는 문제: ${set.remainingToday}`]),
        ];
        return { text: lines.join('\n\n'), data: { ...set } };
      }
      default: {
        const _exhaustive: never = set;
        return _exhaustive;
      }
    }
  }
}

function describe(q: ServedQuestion): string {
  const head = `[문제 ${q.questionId}] ${q.concept} (${q.type === 'MULTIPLE_CHOICE' ? '객관식' : '빈칸'})\n${q.prompt}`;
  return q.choices === null ? head : `${head}\n${q.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
}
