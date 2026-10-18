import { Module, type OnModuleInit } from '@nestjs/common';
import { ConceptMergeParticipants } from '../../core/knowledge/concept-merge.js';
import { KnowledgeModule } from '../../core/knowledge/knowledge.module.js';
import { LlmModule } from '../../core/llm/llm.module.js';
import { MemoryModule } from '../../core/memory/memory.module.js';
import { SettingModule } from '../../core/setting/setting.module.js';
import { MasteryModule } from '../mastery/mastery.module.js';
import { StudyModule } from '../study/study.module.js';
import { QuestionGenerator, QuizAttemptRepository, QuizQuestionRepository } from './application/ports.js';
import { QuizGenerationService, RANDOM } from './application/quiz-generation.service.js';
import { QuizGradingService } from './application/quiz-grading.service.js';
import { QuizGuidelineService } from './application/quiz-guideline.service.js';
import { QuizReviewService } from './application/quiz-review.service.js';
import { ClaudeQuestionGenerator } from './infrastructure/claude-question.generator.js';
import { DrizzleQuizAttemptRepository } from './infrastructure/drizzle-quiz-attempt.repository.js';
import { DrizzleQuizQuestionRepository } from './infrastructure/drizzle-quiz-question.repository.js';
import { GetReviewSetTool } from './presentation/mcp/get-review-set.tool.js';
import { ReportQuestionTool } from './presentation/mcp/report-question.tool.js';
import { SubmitAnswerTool } from './presentation/mcp/submit-answer.tool.js';
import { UpdateQuizGuidelineTool } from './presentation/mcp/update-quiz-guideline.tool.js';

/**
 * 객관식·빈칸 출제·검증, 복습 문제 고르기, 채점·신고, 출제 지침 (설계 문서 7.3). 모듈 안을 레이어 폴더로 나눈다 (ADR-0020·0029).
 * 출력 포트(저장소, 출제 LLM 어댑터)는 여기서 infrastructure 구현에 잇고, 개념 병합 때 문제를 옮기도록 등록한다.
 */
@Module({
  imports: [KnowledgeModule, MemoryModule, StudyModule, MasteryModule, SettingModule, LlmModule],
  providers: [
    DrizzleQuizQuestionRepository,
    { provide: QuizQuestionRepository, useExisting: DrizzleQuizQuestionRepository },
    { provide: QuizAttemptRepository, useClass: DrizzleQuizAttemptRepository },
    { provide: QuestionGenerator, useClass: ClaudeQuestionGenerator },
    { provide: RANDOM, useValue: Math.random },
    QuizGenerationService,
    QuizReviewService,
    QuizGradingService,
    QuizGuidelineService,
    GetReviewSetTool,
    SubmitAnswerTool,
    ReportQuestionTool,
    UpdateQuizGuidelineTool,
  ],
  exports: [QuizGenerationService],
})
export class QuizModule implements OnModuleInit {
  constructor(
    private readonly mergeParticipants: ConceptMergeParticipants,
    private readonly questions: DrizzleQuizQuestionRepository,
  ) {}

  onModuleInit() {
    this.mergeParticipants.register(this.questions);
  }
}
