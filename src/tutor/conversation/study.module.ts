import { Module } from '@nestjs/common';
import { GetLearningContextTool } from './mcp/get-learning-context.tool.js';
import { RecordStudyNoteTool } from './mcp/record-study-note.tool.js';
import { StudyNoteRepository } from './study-note.repository.js';
import { StudyNoteService } from './study-note.service.js';

/**
 * 학습 맥락 조회와 학습 기록 (MCP 도구). MCP 진입점이 import한다.
 * Discord 대화 코드(ConversationModule)를 지울 때 이 모듈만 남긴다 (로드맵 1단계).
 */
@Module({
  providers: [StudyNoteRepository, StudyNoteService, GetLearningContextTool, RecordStudyNoteTool],
  exports: [StudyNoteService],
})
export class StudyModule {}
