import { Module } from '@nestjs/common';
import { ConceptMergeParticipants } from './concept-merge.js';
import { ConceptRepository } from './concept.repository.js';
import { ConceptService } from './concept.service.js';

/**
 * 트랙과 개념 그래프 (설계 문서 5.1, ADR-0021). 시드 적재는 `npm run db:seed`가 한다.
 * 개념 병합에 데이터를 옮겨야 하는 모듈은 [ConceptMergeParticipants]에 등록한다.
 */
@Module({
  providers: [ConceptRepository, ConceptService, ConceptMergeParticipants],
  exports: [ConceptService, ConceptMergeParticipants],
})
export class KnowledgeModule {}
