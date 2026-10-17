import { Module } from '@nestjs/common';
import { ExperienceRepository } from './experience.repository.js';
import { SourceDocumentRepository } from './source-document.repository.js';

/** 원문 문서와 청크, 경험 카드 (설계 문서 5.2). 판단 사례는 다음 단계에서 더한다. */
@Module({
  providers: [SourceDocumentRepository, ExperienceRepository],
  exports: [SourceDocumentRepository, ExperienceRepository],
})
export class MemoryModule {}
