import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** 회사 고유 용어 (설계 문서 5.2). 레포가 아니라 DB에만 둔다. */
export const domainTerm = pgTable('domain_term', {
  term: text('term').primaryKey(),
  replacement: text('replacement').notNull(),
  isPattern: boolean('is_pattern').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
