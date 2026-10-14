import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { snowflake } from '../../core/db/columns.js';
import { CONVERSATION_STATUSES, MESSAGE_ROLES } from './session.js';

export const conversationSession = pgTable(
  'conversation_session',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    discordThreadId: snowflake('discord_thread_id').notNull().unique(),
    topic: text('topic'),
    status: varchar('status', { length: 16, enum: CONVERSATION_STATUSES }).notNull(),
    summary: text('summary'),
    summarizedMessageId: bigint('summarized_message_id', { mode: 'number' }),
    answerRevealed: boolean('answer_revealed').notNull().default(false),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [
    check('conversation_session_status_check', sql`${t.status} IN ('ACTIVE', 'CLOSED')`),
    // 유휴 종료 작업이 1분마다 활성 세션만 찾는다.
    index('idx_conversation_session_active')
      .on(t.status)
      .where(sql`status = 'ACTIVE'`),
  ],
);

export const conversationMessage = pgTable(
  'conversation_message',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    sessionId: bigint('session_id', { mode: 'number' })
      .notNull()
      .references(() => conversationSession.id),
    role: varchar('role', { length: 16, enum: MESSAGE_ROLES }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('conversation_message_role_check', sql`${t.role} IN ('USER', 'TUTOR')`),
    index('idx_conversation_message_session').on(t.sessionId, t.id),
  ],
);
