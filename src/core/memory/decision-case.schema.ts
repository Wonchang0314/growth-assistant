import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { inList } from '../db/sql.js';
import { concept } from '../knowledge/concept.schema.js';
import { DECISION_CASE_STATUSES, type DecisionCaseBody } from './decision-case.js';
import { experience } from './experience.schema.js';

/**
 * 판단 사례 (ADR-0021, 설계 문서 5.2). 경험 카드 하나에 하나다. 카드를 다시 뽑으면 카드와 함께 지워진다.
 * [reviewNote]는 게이트에 걸린 이유(PENDING)나 사람이 검토하며 남긴 말이다.
 */
export const decisionCase = pgTable(
  'decision_case',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    experienceId: bigint('experience_id', { mode: 'number' })
      .notNull()
      .unique()
      .references(() => experience.id, { onDelete: 'cascade' }),
    situation: text('situation').notNull(),
    constraints: text('constraints').array().notNull(),
    options: jsonb('options').$type<DecisionCaseBody['options']>().notNull(),
    decision: text('decision').notNull(),
    rationale: text('rationale').notNull(),
    outcome: text('outcome').notNull(),
    invariants: text('invariants').array().notNull(),
    status: varchar('status', { length: 16, enum: DECISION_CASE_STATUSES }).notNull(),
    reviewNote: text('review_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('idx_decision_case_status').on(t.status),
    check('decision_case_status_check', sql`${t.status} IN (${inList(DECISION_CASE_STATUSES)})`),
  ],
);

/** 판단 사례가 다룬 개념. 원래 카드의 개념을 그대로 잇는다. */
export const decisionCaseConcept = pgTable(
  'decision_case_concept',
  {
    caseId: bigint('case_id', { mode: 'number' })
      .notNull()
      .references(() => decisionCase.id, { onDelete: 'cascade' }),
    conceptId: bigint('concept_id', { mode: 'number' })
      .notNull()
      .references(() => concept.id),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.conceptId] }), index('idx_decision_case_concept_concept').on(t.conceptId)],
);
