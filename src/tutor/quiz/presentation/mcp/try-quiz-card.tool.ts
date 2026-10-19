import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult, type McpToolView } from '../../../../core/mcp/mcp-tool.js';
import { QuizCardService } from '../../application/quiz-card.service.js';

const input = z.object({});

/** 빌드할 때 dist로 함께 복사한다 (nest-cli.json). */
const VIEW: McpToolView = {
  uri: 'ui://growth-assistant/quiz-card.html',
  name: '퀴즈 카드',
  html: readFileSync(join(import.meta.dirname, 'views', 'quiz-card.html'), 'utf8'),
};

@McpTool()
@Injectable()
export class TryQuizCardTool implements McpToolHandler<typeof input> {
  readonly name = 'try_quiz_card';
  readonly description =
    'MCP Apps 시험용. 문제 풀의 객관식 문제 하나를 화면 카드로 보여 준다. 사용자가 "퀴즈 카드 보여 줘"라고 할 때만 부르고, ' +
    '평소 복습("복습하자", "문제 내줘")에는 get_review_set을 쓴다. 사용자는 카드에서 보기와 확신도를 눌러 답하고 카드가 직접 채점한다.';
  readonly inputSchema = input;
  readonly readOnly = true;
  readonly view = VIEW;

  constructor(private readonly cards: QuizCardService) {}

  async handle(): Promise<McpToolResult> {
    const card = await this.cards.pick();
    if (!card) return { text: '문제 풀에 낼 수 있는 객관식 문제가 없다. get_review_set으로 먼저 문제를 만든다.' };
    const lines = [
      '카드가 화면에 보이면 사용자가 카드에서 답하고 채점까지 한다. 카드가 보이지 않으면 아래 문제를 그대로 내고 평소처럼 submit_answer로 채점한다.',
      `[문제 ${card.questionId}] ${card.concept} (객관식)`,
      card.prompt,
      ...card.choices.map((c, i) => `${i + 1}. ${c}`),
    ];
    return { text: lines.join('\n'), data: { ...card } };
  }
}
