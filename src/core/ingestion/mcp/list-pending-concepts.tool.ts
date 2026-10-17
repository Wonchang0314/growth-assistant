import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../mcp/mcp-tool.js';
import { ConceptReviewService } from '../concept-review.service.js';

const input = z.object({
  limit: z.number().int().min(1).max(50).default(20).describe('한 번에 볼 개념 수'),
});

@McpTool()
@Injectable()
export class ListPendingConceptsTool implements McpToolHandler<typeof input> {
  readonly name = 'list_pending_concepts';
  readonly description =
    '수집에서 새로 생긴 개념 중 사람이 검토할 것을 돌려준다: 승인 대기 개념과, 자동 승인됐지만 아직 보지 않은 개념. ' +
    '개념마다 연결된 경험 카드 수와 카드 제목을 함께 준다. 사용자가 "승인 대기 개념 보여줘"처럼 개념 검토를 원할 때 부른다. ' +
    '목록을 보여 준 뒤 개념마다 승인·고쳐서 승인·병합·거절 중 무엇을 할지 사용자에게 묻고 review_concept로 반영한다.';
  readonly inputSchema = input;
  readonly readOnly = true;

  constructor(private readonly service: ConceptReviewService) {}

  async handle({ limit }: z.output<typeof input>): Promise<McpToolResult> {
    const concepts = await this.service.listPending(limit);
    if (concepts.length === 0) return { text: '검토할 개념이 없다.', data: { concepts } };
    const lines = concepts.map((c) =>
      [
        `- ${c.name} [${c.status === 'PROPOSED' ? '승인 대기' : '자동 승인'}] ${c.track}, 카드 ${c.cardCount}장`,
        c.parent && `  상위: ${c.parent}`,
        `  설명: ${c.description}`,
        c.aliases.length > 0 && `  별칭: ${c.aliases.join(', ')}`,
        c.cardTitles.length > 0 && `  카드: ${c.cardTitles.join(' / ')}`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
    return { text: `검토할 개념 ${concepts.length}개 (카드가 많은 것부터)\n${lines.join('\n')}`, data: { concepts } };
  }
}
