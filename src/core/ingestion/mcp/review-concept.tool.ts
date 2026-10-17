import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../mcp/mcp-tool.js';
import { type ConceptEdit, ConceptReviewService, type ReviewDecision } from '../concept-review.service.js';

const name = z.string().trim().min(1).max(100);

const input = z.object({
  concept: name.describe('검토할 개념 이름. list_pending_concepts가 돌려준 이름을 그대로 쓴다'),
  action: z
    .enum(['APPROVE', 'MERGE', 'REJECT'])
    .describe(
      'APPROVE: 승인(아래 값을 주면 고쳐서 승인). MERGE: 같은 뜻의 기존 개념에 합침(카드 연결을 옮기고 이름은 별칭으로 남김). ' +
        'REJECT: 개념으로 다룰 것이 아니면 거절(같은 이름으로 다시 제안돼도 만들지 않음)',
    ),
  into: name.optional().describe('MERGE일 때 합칠 기존 개념 이름'),
  name: name.optional().describe('APPROVE일 때 새 이름. 개념 하나만 담는다'),
  track: z.string().trim().min(1).optional().describe('APPROVE일 때 옮길 트랙 키'),
  parent: name.nullable().optional().describe('APPROVE일 때 상위 개념 이름(PART_OF). null이면 상위 관계를 지운다'),
  description: z.string().trim().min(1).max(500).optional().describe('APPROVE일 때 새 설명'),
  aliases: z
    .array(name)
    .max(10)
    .optional()
    .describe('APPROVE일 때 별칭 전체를 이 목록으로 바꾼다. 같은 개념의 다른 표기(영문 이름, 약어)만 넣는다'),
});

@McpTool()
@Injectable()
export class ReviewConceptTool implements McpToolHandler<typeof input> {
  readonly name = 'review_concept';
  readonly description =
    'list_pending_concepts로 본 개념 하나를 승인·고쳐서 승인·병합·거절한다. 사용자가 개념마다 정한 대로 한 번씩 부른다. ' +
    '승인된 개념만 학습 맥락과 출제에 쓰인다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly service: ConceptReviewService) {}

  async handle({ concept, action, into, ...edit }: z.output<typeof input>): Promise<McpToolResult> {
    const text = await this.service.review({ concept, decision: decisionOf(action, into, edit) });
    return { text };
  }
}

function decisionOf(
  action: z.output<typeof input>['action'],
  into: string | undefined,
  edit: ConceptEdit,
): ReviewDecision {
  switch (action) {
    case 'APPROVE':
      return { kind: 'APPROVE', edit };
    case 'MERGE':
      if (into === undefined) throw new Error('MERGE에는 into(합칠 기존 개념 이름)가 필요하다');
      return { kind: 'MERGE', into };
    case 'REJECT':
      return { kind: 'REJECT' };
  }
}
