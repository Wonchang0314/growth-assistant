import { Module, type OnModuleInit } from '@nestjs/common';
import { ConceptMergeParticipants } from '../../core/knowledge/concept-merge.js';
import { KnowledgeModule } from '../../core/knowledge/knowledge.module.js';
import { MasteryRepository } from './mastery.repository.js';
import { MasteryService } from './mastery.service.js';

/** 개념별 FSRS 복습 일정과 숙련도·약점. 학습 기록과 퀴즈 채점이 갱신하고, 개념 병합 때 일정을 옮긴다. */
@Module({
  imports: [KnowledgeModule],
  providers: [MasteryRepository, MasteryService],
  exports: [MasteryService],
})
export class MasteryModule implements OnModuleInit {
  constructor(
    private readonly mergeParticipants: ConceptMergeParticipants,
    private readonly repository: MasteryRepository,
  ) {}

  onModuleInit() {
    this.mergeParticipants.register(this.repository);
  }
}
