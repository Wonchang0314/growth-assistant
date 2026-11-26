import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { LlmModule } from '../llm/llm.module.js';
import { MemoryModule } from '../memory/memory.module.js';
import { CaseAbstractionService } from './case-abstraction.service.js';
import { ConceptReviewRepository } from './concept-review.repository.js';
import { ConceptReviewService } from './concept-review.service.js';
import { DocumentSource } from './document-source.js';
import { ExtractionService } from './extraction.service.js';
import { ListPendingConceptsTool } from './mcp/list-pending-concepts.tool.js';
import { ReviewConceptTool } from './mcp/review-concept.tool.js';
import { NotionApi } from './notion/notion-api.js';
import { NotionSource } from './notion/notion.source.js';
import { SyncService } from './sync.service.js';

/**
 * Notion 수집과 증분 동기화, 경험 카드 추출, 판단 사례 추상화, 개념 검토 (설계 문서 6장, 7.1).
 * 수집은 꺼 두어(ADR-0042) 동기화·추출·추상화는 `npm run sync`·`extract`·`abstract`로 손으로만 돌린다.
 * MCP에는 승인 대기 개념 검토만 연다. 수집 상태·바로 동기화(`sync_now`, `IngestionPipeline`)와 판단 사례 검토 도구는
 * 등록에서 뺐고 코드는 남긴다.
 */
@Module({
  imports: [MemoryModule, KnowledgeModule, LlmModule],
  providers: [
    {
      provide: DocumentSource,
      inject: [ConfigService],
      // 토큰이 없어도 만들어 둔다. 수집하지 않는 진입점도 토큰 없이 떠야 하고, 수집할 때 없으면 그때 실패한다.
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
    ListPendingConceptsTool,
    ReviewConceptTool,
  ],
  exports: [SyncService, ExtractionService, CaseAbstractionService],
})
export class IngestionModule {}
