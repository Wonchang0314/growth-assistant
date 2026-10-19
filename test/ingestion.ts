import { Pool } from 'pg';
import { inject } from 'vitest';
import type { Clock } from '../src/core/clock/clock.js';
import type { Db } from '../src/core/db/db.module.js';
import { ExtractionService } from '../src/core/ingestion/extraction.service.js';
import { IngestionPipeline } from '../src/core/ingestion/ingestion-pipeline.js';
import { SyncService } from '../src/core/ingestion/sync.service.js';
import { ConceptRepository } from '../src/core/knowledge/concept.repository.js';
import { ConceptService } from '../src/core/knowledge/concept.service.js';
import { ExperienceRepository } from '../src/core/memory/experience.repository.js';
import { SourceDocumentRepository } from '../src/core/memory/source-document.repository.js';
import { JobLock } from '../src/core/scheduler/job-lock.js';
import { FakeClaudeClient } from './fakes/fake-claude.client.js';
import { FakeDocumentSource } from './fakes/fake-document-source.js';

/** 문서가 없을 때의 추출 응답(카드·새 개념 없음). */
export const emptyExtractionReply = JSON.stringify({ summary: '요약', experiences: [], newConcepts: [] });

/**
 * 공용 테스트 DB에 붙는 수집 파이프라인(동기화 → 추출)과 그 잠금. Notion·`claude -p`는 가짜다.
 * 잠금은 세션 advisory 잠금이라 따로 연 풀을 쓴다. 파일 끝에 `close()`를 부른다.
 */
export function createTestIngestion(db: Db, clock: Clock) {
  const pool = new Pool(inject('database'));
  const lock = new JobLock(pool);
  const source = new FakeDocumentSource();
  const claude = new FakeClaudeClient();
  const documents = new SourceDocumentRepository(db);
  const pipeline = new IngestionPipeline(
    new SyncService(source, documents, clock),
    new ExtractionService(
      claude,
      documents,
      new ExperienceRepository(db),
      new ConceptService(new ConceptRepository(db)),
      clock,
    ),
    lock,
  );
  return { pipeline, lock, source, claude, documents, close: () => pool.end() };
}
