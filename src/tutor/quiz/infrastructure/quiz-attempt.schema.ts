import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { inList } from '../../../core/db/sql.js';
import { CONFIDENCES } from '../../mastery/mastery.js';
import { quizQuestion } from './quiz-question.schema.js';

/**
 * 풀이 하나 (설계 문서 5.4). 객관식 [userAnswer]는 고른 보기의 글이고, 오답이면 그 보기의 오개념을 [misconception]에 남긴다.
 * [responseTimeMs]는 응답 시간을 재는 화면(MCP Apps)이 생기면 채운다.
 */
export const quizAttempt = pgTable(
  'quiz_attempt',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    questionId: bigint('question_id', { mode: 'number' })
      .notNull()
      .references(() => quizQuestion.id),
    userAnswer: text('user_answer').notNull(),
    isCorrect: boolean('is_correct').notNull(),
    confidence: varchar('confidence', { length: 16, enum: CONFIDENCES }).notNull(),
    hintUsed: boolean('hint_used').notNull(),
    misconception: text('misconception'),
    responseTimeMs: integer('response_time_ms'),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('idx_quiz_attempt_question').on(t.questionId),
    // 오늘 푼 수를 센다.
    index('idx_quiz_attempt_answered_at').on(t.answeredAt),
    check('quiz_attempt_confidence_check', sql`${t.confidence} IN (${inList(CONFIDENCES)})`),
  ],
);
