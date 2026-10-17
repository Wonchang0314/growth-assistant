import { sql } from 'drizzle-orm';
import { bigint, check, date, index, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { inList } from '../db/sql.js';
import { concept } from '../knowledge/concept.schema.js';
import { CASE_SCREENS } from './decision-case.js';
import { EXPERIENCE_ORIGINS } from './experience.js';
import { sourceDocument } from './source-document.schema.js';

/** 경험 카드 (STAR+L, 설계 문서 5.2). 문서에서 뽑은 카드는 문서를 다시 추출할 때 통째로 바뀐다. */
export const experience = pgTable(
  'experience',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    documentId: bigint('document_id', { mode: 'number' }).references(() => sourceDocument.id, { onDelete: 'cascade' }),
    origin: varchar('origin', { length: 16, enum: EXPERIENCE_ORIGINS }).notNull(),
    projectName: text('project_name'),
    title: text('title').notNull(),
    situation: text('situation').notNull(),
    task: text('task').notNull(),
    action: text('action').notNull(),
    result: text('result').notNull(),
    lesson: text('lesson').notNull(),
    occurredAt: date('occurred_at'),
    /** 판단 사례로 만들 만한 판단이 들어 있는지 선별한 결과. 아직 보지 않았으면 null. */
    caseScreen: varchar('case_screen', { length: 16, enum: CASE_SCREENS }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('idx_experience_document').on(t.documentId),
    check('experience_origin_check', sql`${t.origin} IN (${inList(EXPERIENCE_ORIGINS)})`),
    check('experience_case_screen_check', sql`${t.caseScreen} IN (${inList(CASE_SCREENS)})`),
  ],
);

/** 경험 카드가 다룬 개념. 승인 대기 개념에도 연결한다 (ADR-0007). */
export const experienceConcept = pgTable(
  'experience_concept',
  {
    experienceId: bigint('experience_id', { mode: 'number' })
      .notNull()
      .references(() => experience.id, { onDelete: 'cascade' }),
    conceptId: bigint('concept_id', { mode: 'number' })
      .notNull()
      .references(() => concept.id),
  },
  (t) => [
    primaryKey({ columns: [t.experienceId, t.conceptId] }),
    // 개념으로 경험 카드를 찾는다.
    index('idx_experience_concept_concept').on(t.conceptId),
  ],
);
