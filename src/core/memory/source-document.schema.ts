import { sql } from 'drizzle-orm';
import { bigint, check, integer, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { inList } from '../db/sql.js';
import { EXTRACTION_STATUSES, SOURCES } from './source-document.js';

/** 원천 문서 (설계 문서 5.2). 본문은 [documentChunk]에 나눠 둔다. */
export const sourceDocument = pgTable(
  'source_document',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    source: varchar('source', { length: 16, enum: SOURCES }).notNull(),
    externalId: varchar('external_id', { length: 64 }).notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    /** 경험 카드를 뽑을 때 Claude가 갱신한다 (2단계 추출). */
    summary: text('summary'),
    contentHash: varchar('content_hash', { length: 64 }).notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }).notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    extractionStatus: varchar('extraction_status', { length: 16, enum: EXTRACTION_STATUSES })
      .notNull()
      .default('PENDING'),
    lastError: text('last_error'),
  },
  (t) => [
    unique('source_document_source_external_id_key').on(t.source, t.externalId),
    check('source_document_source_check', sql`${t.source} IN (${inList(SOURCES)})`),
    check('source_document_extraction_status_check', sql`${t.extractionStatus} IN (${inList(EXTRACTION_STATUSES)})`),
  ],
);

/** 문서 본문의 청크. 문서 내용이 바뀌면 통째로 다시 쓴다. */
export const documentChunk = pgTable(
  'document_chunk',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    documentId: bigint('document_id', { mode: 'number' })
      .notNull()
      .references(() => sourceDocument.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    chunkHash: varchar('chunk_hash', { length: 64 }).notNull(),
    content: text('content').notNull(),
  },
  (t) => [unique('document_chunk_document_seq_key').on(t.documentId, t.seq)],
);

/** 원천마다 마지막으로 동기화를 끝낸 시각. */
export const syncCursor = pgTable(
  'sync_cursor',
  {
    source: varchar('source', { length: 16, enum: SOURCES }).primaryKey(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }).notNull(),
  },
  (t) => [check('sync_cursor_source_check', sql`${t.source} IN (${inList(SOURCES)})`)],
);

export type SourceDocument = typeof sourceDocument.$inferSelect;
