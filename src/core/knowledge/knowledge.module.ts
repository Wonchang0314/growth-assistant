import { Module } from '@nestjs/common';
import { ConceptRepository } from './concept.repository.js';
import { ConceptService } from './concept.service.js';

/** 트랙과 개념 그래프 (설계 문서 5.1, ADR-0021). 시드 적재는 `npm run db:seed`가 한다. */
@Module({
  providers: [ConceptRepository, ConceptService],
  exports: [ConceptService],
})
export class KnowledgeModule {}
