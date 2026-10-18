import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../../../core/mcp/mcp-tool.js';
import { QuizGuidelineService } from '../../application/quiz-guideline.service.js';

const rule = z.string().trim().min(1).max(300);
const input = z.object({
  add: z
    .array(rule)
    .max(10)
    .default([])
    .describe(
      '더할 규칙. 한 항목에 하나씩, 사용자가 말한 요청을 문제 만드는 사람에게 주는 지시로. 예: "보기에 코드 조각을 넣지 않는다"',
    ),
  remove: z.array(rule).max(10).default([]).describe('지울 규칙. 이 도구가 돌려준 목록의 문장을 그대로 쓴다'),
});

@McpTool()
@Injectable()
export class UpdateQuizGuidelineTool implements McpToolHandler<typeof input> {
  readonly name = 'update_quiz_guideline';
  readonly description =
    '출제 지침(문제 품질에 대한 사용자의 요청)을 고친다. 지침은 새 문제를 만들 때마다 출제 프롬프트에 들어간다. ' +
    '사용자가 "이런 문제는 내지 마", "보기를 더 짧게"처럼 문제 품질을 요청하면 부른다. ' +
    'add·remove 없이 부르면 지금 지침만 돌려준다. 지울 때는 먼저 목록을 보고 문장을 그대로 넘긴다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly guideline: QuizGuidelineService) {}

  async handle({ add, remove }: z.output<typeof input>): Promise<McpToolResult> {
    const { rules, notFound } =
      add.length === 0 && remove.length === 0
        ? { rules: await this.guideline.rules(), notFound: [] }
        : await this.guideline.edit({ add, remove });
    const lines = [
      rules.length === 0 ? '출제 지침 없음' : `출제 지침 ${rules.length}개:\n${rules.map((r) => `- ${r}`).join('\n')}`,
      ...(notFound.length === 0 ? [] : [`목록에 없어 지우지 못함: ${notFound.join(', ')}`]),
    ];
    return { text: lines.join('\n'), data: { rules, notFound } };
  }
}
