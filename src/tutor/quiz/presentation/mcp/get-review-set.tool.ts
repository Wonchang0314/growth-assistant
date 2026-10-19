import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult, type McpToolView } from '../../../../core/mcp/mcp-tool.js';
import { QuizReviewService, RETRY_AFTER_MS, type ServedQuestion } from '../../application/quiz-review.service.js';
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
  more: z
    .boolean()
    .optional()
    .describe(
      '오늘 복습을 마친 뒤 사용자가 "더 풀래", "10문제 더", "더 내줘"처럼 더 풀겠다고 직접 말했을 때만 true. ' +
        '하루 상한과 상관없이 오늘 푼 개념을 뺀 문제를 더 낸다. 그 밖에는 비운다',
    ),
});

@McpTool()
@Injectable()
export class GetReviewSetTool implements McpToolHandler<typeof input> {
  readonly name = 'get_review_set';
  readonly description =
    '복습할 퀴즈 문제(지금은 객관식)를 가져온다. 사용자가 "복습하자", "문제 내줘", "OO 문제 내줘"라고 하면 부른다. ' +
    '개념을 고르지 않으면 복습할 때가 된 개념, 헷갈렸던 개념, 약점, 새 개념 순으로 하루 10문제 안에서 고른다. ' +
    '오늘 몫을 다 푼 뒤 사용자가 더 풀겠다고 하면 more로 10문제를 더 낸다. ' +
    '고른 문제를 모두 MCP Apps 복습 카드로 보여 주고, 사용자는 카드에서 문제마다 보기와 확신도를 골라 제출한다(카드가 submit_answer로 채점). ' +
    '정답은 돌려주지 않는다.';
  readonly inputSchema = input;
  readonly readOnly = false;
  /** 빌드할 때 dist로 함께 복사한다 (nest-cli.json). */
  readonly view: McpToolView = {
    uri: 'ui://growth-assistant/review-card.html',
    name: '오늘 복습 카드',
    html: readFileSync(join(import.meta.dirname, 'views', 'review-card.html'), 'utf8'),
  };

  constructor(private readonly review: QuizReviewService) {}

  async handle(args: z.output<typeof input>): Promise<McpToolResult> {
    const set = await this.review.reviewSet(args);
    switch (set.kind) {
      case 'UNKNOWN_CONCEPT':
        return { text: `개념 목록에 없다: ${set.name}`, data: { questions: [] } };
      case 'DAILY_LIMIT_REACHED':
        return {
          text:
            `오늘 복습 ${DAILY_LIMIT}문제를 다 풀었다. 내일 이어서 한다. ` +
            `사용자가 더 풀고 싶어 하면 more를 true로 다시 불러 ${DAILY_LIMIT}문제를 더 낼 수 있다.`,
          data: { kind: set.kind, questions: [] },
        };
      case 'READY': {
        const lines = [
          ...set.questions.map(describe),
          ...(set.preparing.length === 0
            ? []
            : [`문제를 만드는 중(1~2분 걸림, 다시 부르면 나옴): ${set.preparing.join(', ')}`]),
          ...(set.failed.length === 0
            ? []
            : [
                `문제를 만들지 못함(검증을 통과하지 못함, ${RETRY_AFTER_MS / 60_000}분 뒤 다시 만든다): ${set.failed.join(', ')}`,
              ]),
        ];
        return { text: lines.join('\n\n') || '오늘 복습할 문제가 없어요', data: { ...set } };
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
