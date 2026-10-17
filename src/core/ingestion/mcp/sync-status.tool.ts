import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Clock } from '../../clock/clock.js';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../mcp/mcp-tool.js';
import { SourceDocumentRepository } from '../../memory/source-document.repository.js';

const input = z.object({});

@McpTool()
@Injectable()
export class SyncStatusTool implements McpToolHandler<typeof input> {
  readonly name = 'sync_status';
  readonly description =
    'Notion에서 모은 문서의 상태(마지막 동기화 시각, 문서·청크 수, 경험 카드 추출 상태별 문서 수)를 돌려준다. ' +
    '사용자가 수집이 됐는지, 언제 동기화했는지 물을 때 부른다.';
  readonly inputSchema = input;
  readonly readOnly = true;

  constructor(
    private readonly repository: SourceDocumentRepository,
    private readonly clock: Clock,
  ) {}

  async handle(): Promise<McpToolResult> {
    const status = await this.repository.status('NOTION');
    const when = status.lastSyncedAt
      ? status.lastSyncedAt.toLocaleString('ko-KR', { timeZone: this.clock.timeZone })
      : '아직 동기화하지 않음';
    const byStatus = Object.entries(status.byExtractionStatus)
      .map(([s, n]) => `${s} ${n}`)
      .join(', ');
    return {
      text: `Notion: 마지막 동기화 ${when}, 문서 ${status.documents}개(${byStatus || '없음'}), 청크 ${status.chunks}개`,
      data: { ...status, lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null },
    };
  }
}
