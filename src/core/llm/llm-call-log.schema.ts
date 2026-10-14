import { bigint, boolean, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/** `claude` CLI 호출 한 번의 기록. 성공·실패 모두 남긴다. */
export const llmCallLog = pgTable(
  'llm_call_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    purpose: varchar('purpose', { length: 32 }).notNull(),
    model: varchar('model', { length: 64 }).notNull(),
    durationMs: bigint('duration_ms', { mode: 'number' }).notNull(),
    success: boolean('success').notNull(),
    inputChars: integer('input_chars').notNull(),
    outputChars: integer('output_chars').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('idx_llm_call_log_created_at').on(t.createdAt)],
);

export type LlmCallLog = typeof llmCallLog.$inferSelect;
export type NewLlmCallLog = typeof llmCallLog.$inferInsert;
