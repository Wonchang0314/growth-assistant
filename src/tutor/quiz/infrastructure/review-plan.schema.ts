import { bigint, date, pgTable, primaryKey, smallint, unique } from 'drizzle-orm/pg-core';
import { concept } from '../../../core/knowledge/concept.schema.js';

/**
 * 날짜별 오늘 낼 개념과 순서 (ADR-0040). 개념이 지워지면(시드에서 빠짐, 병합) 그날 계획에서도 빠진다.
 * 지난 날의 계획은 읽지 않지만 지우지 않는다(하루 20줄).
 */
export const reviewPlan = pgTable(
  'review_plan',
  {
    planDate: date('plan_date').notNull(),
    position: smallint('position').notNull(),
    conceptId: bigint('concept_id', { mode: 'number' })
      .notNull()
      .references(() => concept.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.planDate, t.position] }), unique().on(t.planDate, t.conceptId)],
);
