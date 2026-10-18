import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../../core/mcp/mcp-tool.js';
import { QuizGradingService } from '../../application/quiz-grading.service.js';

const input = z.object({
  questionId: z.number().int().positive().describe('문제 번호'),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('무엇이 이상한지. 예: "2번도 맞다", "빈칸에 다른 표기도 맞다", "사실이 틀렸다"'),
});

@McpTool()
@Injectable()
export class ReportQuestionTool implements McpToolHandler<typeof input> {
  readonly name = 'report_question';
  readonly description =
    '문제에 오류가 있다고 신고한다. 사용자가 "이 문제 이상해"라고 하거나, 정답이 둘이거나 사실이 틀린 문제를 발견하면 부른다. ' +
    '신고한 문제는 다시 내지 않고, 그 문제로 푼 기록을 빼고 숙련도를 다시 계산한다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly grading: QuizGradingService) {}

  async handle({ questionId, reason }: z.output<typeof input>): Promise<McpToolResult> {
    const question = await this.grading.report(questionId, reason);
    if (!question) throw new Error(`없는 문제 번호다: ${questionId}`);
    return {
      text: `문제 ${questionId} 신고: 다시 내지 않고, 이 문제의 풀이는 숙련도에서 뺐다`,
      data: { questionId },
    };
  }
}
