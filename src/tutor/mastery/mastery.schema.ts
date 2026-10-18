import { sql } from 'drizzle-orm';
import { bigint, check, doublePrecision, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { inList } from '../../core/db/sql.js';
import { concept } from '../../core/knowledge/concept.schema.js';
import { FSRS_STATES } from './fsrs.js';

/**
 * 개념별 FSRS 복습 일정과 숙련도·약점 (설계 문서 5.3). 대화에서 다뤘거나 풀이한 개념에만 행이 있다.
 * 개념을 지우거나 병합하면 외래 키가 막는다(학습 기록과 같다).
 */
export const conceptMastery = pgTable(
  'concept_mastery',
  {
    conceptId: bigint('concept_id', { mode: 'number' })
      .primaryKey()
      .references(() => concept.id),
    state: varchar('state', { length: 16, enum: FSRS_STATES }).notNull(),
    stability: doublePrecision('stability').notNull(),
    difficulty: doublePrecision('difficulty').notNull(),
    reps: integer('reps').notNull(),
    lapses: integer('lapses').notNull(),
    lastReviewAt: timestamp('last_review_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    masteryScore: doublePrecision('mastery_score').notNull(),
    weaknessScore: doublePrecision('weakness_score').notNull(),
    gradedAttempts: integer('graded_attempts').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    // 복습할 때가 된 개념을 찾는다.
    index('idx_concept_mastery_due_at').on(t.dueAt),
    check('concept_mastery_state_check', sql`${t.state} IN (${inList(FSRS_STATES)})`),
    check(
      'concept_mastery_scores_check',
      sql`${t.masteryScore} BETWEEN 0 AND 1 AND ${t.weaknessScore} BETWEEN 0 AND 1`,
    ),
  ],
);
