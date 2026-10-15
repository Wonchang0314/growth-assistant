import { sql } from 'drizzle-orm';
import { bigint, boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** 대화 중 Claude가 `record_study_note` 도구로 남긴 학습 기록 (설계 문서 5.5). 개념 연결은 개념 그래프(2단계)와 함께 추가한다. */
export const studyNote = pgTable(
  'study_note',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    topic: text('topic').notNull(),
    summary: text('summary').notNull(),
    confusedPoints: text('confused_points')
      .array()
      .notNull()
      .default(sql`'{}'`),
    answerRevealed: boolean('answer_revealed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  // 최근 기록부터 읽는다.
  (t) => [index('idx_study_note_created_at').on(t.createdAt.desc())],
);
