import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../../core/knowledge/knowledge.module.js';
import { GetLearningContextTool } from './mcp/get-learning-context.tool.js';
import { RecordStudyNoteTool } from './mcp/record-study-note.tool.js';
import { StudyNoteRepository } from './study-note.repository.js';
import { StudyNoteService } from './study-note.service.js';

/**
 * 학습 맥락 조회와 학습 기록 (MCP 도구). MCP 진입점이 import한다.
 */
@Module({
  imports: [KnowledgeModule],
  providers: [StudyNoteRepository, StudyNoteService, GetLearningContextTool, RecordStudyNoteTool],
  exports: [StudyNoteService],
})
export class StudyModule {}
