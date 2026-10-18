import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../mcp/mcp-tool.js';
import type { PendingCase } from '../../memory/decision-case.repository.js';
import { CaseReviewService } from '../case-review.service.js';

const input = z.object({
  limit: z.number().int().min(1).max(20).default(5).describe('한 번에 볼 사례 수. 사례마다 원래 카드까지 실어 길다'),
});

@McpTool()
@Injectable()
export class ListPendingCasesTool implements McpToolHandler<typeof input> {
  readonly name = 'list_pending_cases';
  readonly description =
    '경험 카드에서 회사 맥락을 걷어내 만든 판단 사례 중, 자동 검증에 걸려 사람이 검토할 것을 돌려준다. ' +
    '사례마다 걸린 이유, 판단 사례 본문, 비교할 원래 경험 카드를 준다. 사용자가 "판단 사례 검토하자"처럼 원할 때 부른다. ' +
    '사례마다 승인·고쳐서 승인·거절 중 무엇을 할지 사용자에게 묻고 review_case로 반영한다.';
  readonly inputSchema = input;
  readonly readOnly = true;

  constructor(private readonly service: CaseReviewService) {}

  async handle({ limit }: z.output<typeof input>): Promise<McpToolResult> {
    const cases = await this.service.listPending(limit);
    if (cases.length === 0) return { text: '검토할 판단 사례가 없다.', data: { cases } };
    return { text: `검토할 판단 사례 ${cases.length}개\n\n${cases.map(caseText).join('\n\n')}`, data: { cases } };
  }
}

function caseText({ id, body, reviewNote, card }: PendingCase): string {
  const list = (items: readonly string[]) => items.map((i) => `  - ${i}`).join('\n');
  return [
    `## 사례 ${id} (카드: ${card.title})`,
    `걸린 이유: ${reviewNote ?? '없음'}`,
    `상황: ${body.situation}`,
    `제약:\n${list(body.constraints)}`,
    `선택지:\n${list(body.options.map((o) => `${o.chosen ? '[고름] ' : ''}${o.text}: ${o.reason}`))}`,
    `결정: ${body.decision}`,
    `근거: ${body.rationale}`,
    `결과: ${body.outcome}`,
    `불변 조건:\n${list(body.invariants)}`,
    `원래 카드 — 상황: ${card.situation} / 과제: ${card.task} / 행동: ${card.action} / 결과: ${card.result} / 교훈: ${card.lesson}`,
  ].join('\n');
}
