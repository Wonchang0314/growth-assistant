import { Module } from '@nestjs/common';
import { DecisionCaseRepository } from './decision-case.repository.js';
import { ExperienceRepository } from './experience.repository.js';
import { SourceDocumentRepository } from './source-document.repository.js';

/** 원문 문서와 청크, 경험 카드, 판단 사례 (설계 문서 5.2). */
@Module({
  providers: [SourceDocumentRepository, ExperienceRepository, DecisionCaseRepository],
  exports: [SourceDocumentRepository, ExperienceRepository, DecisionCaseRepository],
})
export class MemoryModule {}
