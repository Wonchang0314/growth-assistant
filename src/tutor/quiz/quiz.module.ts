import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../../core/knowledge/knowledge.module.js';
import { LlmModule } from '../../core/llm/llm.module.js';
import { MemoryModule } from '../../core/memory/memory.module.js';
import { SettingModule } from '../../core/setting/setting.module.js';
import { StudyModule } from '../study/study.module.js';
import { QuestionGenerator, QuizQuestionRepository } from './application/ports.js';
import { QuizGenerationService, RANDOM } from './application/quiz-generation.service.js';
import { QuizGuidelineService } from './application/quiz-guideline.service.js';
import { ClaudeQuestionGenerator } from './infrastructure/claude-question.generator.js';
import { DrizzleQuizQuestionRepository } from './infrastructure/drizzle-quiz-question.repository.js';
import { UpdateQuizGuidelineTool } from './presentation/mcp/update-quiz-guideline.tool.js';

/**
 * 객관식·빈칸 출제·검증과 출제 지침 (설계 문서 7.3). 모듈 안을 레이어 폴더로 나눈다 (ADR-0020·0029).
 * 출력 포트(저장소, 출제 LLM 어댑터)는 여기서 infrastructure 구현에 잇는다.
 */
@Module({
  imports: [KnowledgeModule, MemoryModule, StudyModule, SettingModule, LlmModule],
  providers: [
    { provide: QuizQuestionRepository, useClass: DrizzleQuizQuestionRepository },
    { provide: QuestionGenerator, useClass: ClaudeQuestionGenerator },
    { provide: RANDOM, useValue: Math.random },
    QuizGenerationService,
    QuizGuidelineService,
    UpdateQuizGuidelineTool,
  ],
  exports: [QuizGenerationService],
})
export class QuizModule {}
