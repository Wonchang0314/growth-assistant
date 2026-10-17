import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../../core/knowledge/knowledge.module.js';
import { MemoryModule } from '../../core/memory/memory.module.js';
import { GetLearningContextTool } from './mcp/get-learning-context.tool.js';
import { RecordStudyNoteTool } from './mcp/record-study-note.tool.js';
import { SearchExperienceTool } from './mcp/search-experience.tool.js';
import { StudyNoteRepository } from './study-note.repository.js';
import { StudyNoteService } from './study-note.service.js';

/**
 * 학습 맥락 조회, 경험 카드 검색, 학습 기록 (MCP 도구). MCP 진입점이 import한다.
 */
@Module({
  imports: [KnowledgeModule, MemoryModule],
  providers: [StudyNoteRepository, StudyNoteService, GetLearningContextTool, RecordStudyNoteTool, SearchExperienceTool],
  exports: [StudyNoteService],
})
export class StudyModule {}
