import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { McpTool, type McpToolHandler, type McpToolResult } from '../../mcp/mcp-tool.js';
import { IngestionPipeline } from '../ingestion-pipeline.js';

const input = z.object({});

@McpTool()
@Injectable()
export class SyncNowTool implements McpToolHandler<typeof input> {
  readonly name = 'sync_now';
  readonly description =
    'Notion 동기화와 바뀐 문서의 경험 카드 추출을 뒤에서 시작하고 바로 돌아온다. 추출은 `claude -p`로 구독 사용량을 쓴다. ' +
    '매일 새벽에 저절로 하므로, 사용자가 방금 고친 Notion 문서를 지금 반영해 달라고 할 때만 부른다. 진행과 결과는 `sync_status`로 본다.';
  readonly inputSchema = input;
  readonly readOnly = false;

  constructor(private readonly pipeline: IngestionPipeline) {}

  async handle(): Promise<McpToolResult> {
    const started = await this.pipeline.startInBackground();
    return {
      text: started
        ? '동기화를 시작했다. 몇 분 걸리고, 진행은 sync_status로 본다.'
        : '이미 동기화(또는 새벽 작업)가 돌고 있어 새로 시작하지 않았다. 진행은 sync_status로 본다.',
      data: { started },
    };
  }
}
