import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { MemoryModule } from '../memory/memory.module.js';
import { DocumentSource } from './document-source.js';
import { SyncStatusTool } from './mcp/sync-status.tool.js';
import { NotionApi } from './notion/notion-api.js';
import { NotionSource } from './notion/notion.source.js';
import { SyncService } from './sync.service.js';

/** Notion 수집과 증분 동기화 (설계 문서 7.1). 동기화는 `npm run sync`로 돌리고, MCP에는 상태 조회만 연다. */
@Module({
  imports: [MemoryModule],
  providers: [
    {
      provide: DocumentSource,
      inject: [ConfigService],
      // 토큰이 없어도 만들어 둔다. MCP 서버는 수집하지 않으므로 토큰 없이도 떠야 한다.
      useFactory: (config: ConfigService<Env, true>) =>
        new NotionSource(
          new NotionApi({ token: config.get('NOTION_TOKEN', { infer: true }) }),
          config.get('NOTION_ROOT_IDS', { infer: true }),
        ),
    },
    SyncService,
    SyncStatusTool,
  ],
  exports: [SyncService],
})
export class IngestionModule {}
