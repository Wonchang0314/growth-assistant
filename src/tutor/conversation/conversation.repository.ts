import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import { DB, type Db } from '../../core/db/db.module.js';
import { conversationMessage, conversationSession } from './conversation.schema.js';
import type { ActiveSession, ConversationMessage, ConversationSession } from './session.js';

type SessionRow = typeof conversationSession.$inferSelect;

/** 세션·메시지 저장소. 행을 도메인 타입(session.ts)으로 바꿔 돌려준다. */
@Injectable()
export class ConversationRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async createSession(input: {
    discordThreadId: string;
    topic: string | null;
    startedAt: Date;
  }): Promise<ActiveSession> {
    const [row] = await this.db
      .insert(conversationSession)
      .values({ ...input, status: 'ACTIVE' })
      .returning();
    const session = toSession(required(row));
    if (session.status !== 'ACTIVE') throw new Error(`새 세션이 활성 상태가 아니다: ${session.id}`);
    return session;
  }

  async findSession(id: number): Promise<ConversationSession | undefined> {
    const [row] = await this.db.select().from(conversationSession).where(eq(conversationSession.id, id));
    return row && toSession(row);
  }

  async findSessionByThreadId(discordThreadId: string): Promise<ConversationSession | undefined> {
    const [row] = await this.db
      .select()
      .from(conversationSession)
      .where(eq(conversationSession.discordThreadId, discordThreadId));
    return row && toSession(row);
  }

  async findActiveSessions(): Promise<ActiveSession[]> {
    const rows = await this.db.select().from(conversationSession).where(eq(conversationSession.status, 'ACTIVE'));
    return rows.map(toSession).filter((s): s is ActiveSession => s.status === 'ACTIVE');
  }

  /** 도메인 함수가 바꿀 수 있는 필드만 저장한다. */
  async saveSession(session: ConversationSession): Promise<void> {
    await this.db
      .update(conversationSession)
      .set({
        status: session.status,
        summary: session.summary,
        summarizedMessageId: session.summarizedMessageId,
        answerRevealed: session.answerRevealed,
        closedAt: session.closedAt,
      })
      .where(eq(conversationSession.id, session.id));
  }

  async addMessage(message: Omit<ConversationMessage, 'id'>): Promise<ConversationMessage> {
    const [row] = await this.db.insert(conversationMessage).values(message).returning();
    return required(row);
  }

  /** 아직 요약에 합쳐지지 않은 메시지, 시간순. 요약이 없으면 [afterId]로 0을 넘긴다. */
  async findMessagesAfter(sessionId: number, afterId: number): Promise<ConversationMessage[]> {
    return this.db
      .select()
      .from(conversationMessage)
      .where(and(eq(conversationMessage.sessionId, sessionId), gt(conversationMessage.id, afterId)))
      .orderBy(asc(conversationMessage.id));
  }

  /** 마지막 메시지. 유휴 판정에 쓴다. */
  async findLastMessage(sessionId: number): Promise<ConversationMessage | undefined> {
    const [row] = await this.db
      .select()
      .from(conversationMessage)
      .where(eq(conversationMessage.sessionId, sessionId))
      .orderBy(desc(conversationMessage.id))
      .limit(1);
    return row;
  }
}

function toSession(row: SessionRow): ConversationSession {
  const { status, closedAt, ...fields } = row;
  if (status === 'ACTIVE') return { ...fields, status, closedAt: null };
  if (closedAt === null) throw new Error(`종료 시각이 없는 종료 세션: ${row.id}`);
  return { ...fields, status, closedAt };
}

function required<T>(row: T | undefined): T {
  if (row === undefined) throw new Error('INSERT … RETURNING 결과가 없다');
  return row;
}
