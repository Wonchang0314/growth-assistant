import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { CaseAbstractionService } from './case-abstraction.service.js';
import { CaseReviewService } from './case-review.service.js';
import { ConceptReviewRepository } from './concept-review.repository.js';
import { ConceptReviewService } from './concept-review.service.js';
import { DocumentSource } from './document-source.js';
import { ExtractionService } from './extraction.service.js';
import { ListPendingCasesTool } from './mcp/list-pending-cases.tool.js';
import { ListPendingConceptsTool } from './mcp/list-pending-concepts.tool.js';
import { ReviewCaseTool } from './mcp/review-case.tool.js';
import { ReviewConceptTool } from './mcp/review-concept.tool.js';
import { SyncStatusTool } from './mcp/sync-status.tool.js';
import { NotionApi } from './notion/notion-api.js';
import { NotionSource } from './notion/notion.source.js';
import { SyncService } from './sync.service.js';

/**
 * Notion 수집과 증분 동기화, 경험 카드 추출, 판단 사례 추상화, 수집에서 생긴 개념·판단 사례 검토 (설계 문서 6장, 7.1).
 * 동기화·추출·추상화는 `npm run sync`·`npm run extract`·`npm run abstract`로 돌리고, MCP에는 상태 조회와 검토만 연다.
 */
@Module({
  imports: [MemoryModule, KnowledgeModule, LlmModule],
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
    ExtractionService,
    CaseAbstractionService,
    ConceptReviewRepository,
    ConceptReviewService,
    CaseReviewService,
    SyncStatusTool,
    ListPendingConceptsTool,
    ReviewConceptTool,
    ListPendingCasesTool,
    ReviewCaseTool,
  ],
  exports: [SyncService, ExtractionService, CaseAbstractionService],
})
export class IngestionModule {}
