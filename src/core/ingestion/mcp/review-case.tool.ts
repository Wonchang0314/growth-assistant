import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../mcp/mcp-tool.js';
import { decisionCaseBodySchema } from '../../memory/decision-case.js';
import { CaseReviewService } from '../case-review.service.js';

// 고칠 값은 판단 사례 본문의 필드를 그대로 받는다. 준 필드만 통째로 바꾼다.
const input = decisionCaseBodySchema.partial().extend({
  caseId: z.number().int().positive().describe('list_pending_cases가 돌려준 사례 번호'),
  action: z
    .enum(['APPROVE', 'REJECT'])
    .describe('APPROVE: 승인(본문 필드를 주면 그 필드를 바꿔서 승인). REJECT: 문제로 쓰지 않음'),
  note: z.string().trim().min(1).max(500).optional().describe('검토하며 남길 말. 거절이면 이유를 쓴다'),
});

@McpTool()
@Injectable()
export class ReviewCaseTool implements McpToolHandler<typeof input> {
  readonly name = 'review_case';
  readonly description =
    'list_pending_cases로 본 판단 사례 하나를 승인·고쳐서 승인·거절한다. 사용자가 사례마다 정한 대로 한 번씩 부른다. ' +
    '고칠 때는 바꿀 필드(situation, constraints, options, decision, rationale, outcome, invariants)만 새 값 전체로 준다. ' +
    '승인된 사례만 상황 판단형 문제의 재료가 된다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly service: CaseReviewService) {}

  async handle({ caseId, action, note, ...edit }: z.output<typeof input>): Promise<McpToolResult> {
    const text = await this.service.review(
      caseId,
      action === 'APPROVE' ? { kind: 'APPROVE', edit, note: note ?? null } : { kind: 'REJECT', note: note ?? null },
    );
    return { text };
  }
}
