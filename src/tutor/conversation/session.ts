/**
 * 튜터링 대화 도메인 (설계 문서 7.2). Discord 스레드 하나와 1:1로 대응한다.
 * 상태 변경은 이 파일의 함수로만 하고, 함수는 원본을 바꾸지 않고 새 값을 돌려준다 (ADR-0015).
 */

export const CONVERSATION_STATUSES = ['ACTIVE', 'CLOSED'] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const MESSAGE_ROLES = ['USER', 'TUTOR'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

interface SessionFields {
  readonly id: number;
  readonly discordThreadId: string;
  readonly topic: string | null;
  readonly summary: string | null;
  /** [summary]에 합쳐진 마지막 메시지 ID. 이후 메시지만 다음 요약 대상이다. */
  readonly summarizedMessageId: number | null;
  readonly answerRevealed: boolean;
  readonly startedAt: Date;
}

export interface ActiveSession extends SessionFields {
  readonly status: 'ACTIVE';
  readonly closedAt: null;
}

export interface ClosedSession extends SessionFields {
  readonly status: 'CLOSED';
  readonly closedAt: Date;
}

/** 종료된 세션에만 종료 시각이 있다. 닫힌 세션을 다시 닫거나 요약을 바꾸는 호출은 타입에서 막힌다. */
export type ConversationSession = ActiveSession | ClosedSession;

export interface ConversationMessage {
  readonly id: number;
  readonly sessionId: number;
  readonly role: MessageRole;
  readonly content: string;
  readonly createdAt: Date;
}

export function closeSession(session: ActiveSession, summary: string | null, at: Date): ClosedSession {
  return { ...session, status: 'CLOSED', summary, closedAt: at };
}

export function updateSummary(session: ActiveSession, summary: string, untilMessageId: number): ActiveSession {
  return { ...session, summary, summarizedMessageId: untilMessageId };
}

export function markAnswerRevealed(session: ActiveSession): ActiveSession {
  return { ...session, answerRevealed: true };
}
