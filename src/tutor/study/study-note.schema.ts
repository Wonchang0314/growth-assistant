import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { concept } from '../../core/knowledge/concept.schema.js';
import { STUDY_SIGNALS } from './study-note.js';

/** 대화 중 Claude가 `record_study_note` 도구로 남긴 학습 기록 (설계 문서 5.5). */
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

/** 학습 기록에서 다룬 개념. CONFUSED는 출제 우선순위만 올리고 숙련도는 바꾸지 않는다 (설계 문서 7.2). */
export const studyNoteConcept = pgTable(
  'study_note_concept',
  {
    noteId: bigint('note_id', { mode: 'number' })
      .notNull()
      .references(() => studyNote.id, { onDelete: 'cascade' }),
    conceptId: bigint('concept_id', { mode: 'number' })
      .notNull()
      .references(() => concept.id),
    signal: varchar('signal', { length: 16, enum: STUDY_SIGNALS }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.noteId, t.conceptId] }),
    // 개념으로 지난 학습 기록을 찾는다.
    index('idx_study_note_concept_concept').on(t.conceptId),
    check('study_note_concept_signal_check', sql`${t.signal} IN ('DISCUSSED', 'CONFUSED')`),
  ],
);
