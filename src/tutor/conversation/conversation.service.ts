import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../core/clock/clock.js';
import { KeyedLock } from '../../core/concurrency/keyed-lock.js';
import { ClaudeClient, ClaudeException } from '../../core/llm/claude.client.js';
import {
  renderReply,
  SUMMARY_SYSTEM,
  summaryPrompt,
  TUTOR_SYSTEM,
  topicOf,
  tutorPrompt,
  tutorReplySchema,
} from './conversation-prompts.js';
import { ConversationRepository } from './conversation.repository.js';
import {
  type ActiveSession,
  closeSession,
  type ConversationMessage,
  markAnswerRevealed,
  updateSummary,
} from './session.js';

export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;
export const KEEP_RECENT = 8;
export const COMPACT_BATCH = 8;
export const CLOSED_NOTICE = '이 대화는 종료되었습니다. `#튜터` 채널에 새 메시지를 남기면 새 대화를 시작합니다.';

export type EndResult =
  | { readonly kind: 'ended'; readonly summary: string | null }
  | { readonly kind: 'already-closed' }
  | { readonly kind: 'not-found' };

export interface ClosedSession {
  readonly threadId: string;
  readonly summary: string | null;
}

/**
 * 튜터링 대화 유스케이스 (설계 문서 7.2). Discord 스레드 ID로 세션을 찾는다.
 *
 * 맥락은 "요약 + 아직 요약되지 않은 메시지"다. 요약되지 않은 메시지가 [KEEP_RECENT] + [COMPACT_BATCH]개 이상 쌓이면
 * [compact]가 오래된 [COMPACT_BATCH]개 이상을 요약에 합친다. 그래서 원문으로 넣는 메시지는 항상 8~15개다.
 *
 * 같은 세션의 작업은 세션마다 하나씩 차례로 처리한다(빠르게 연달아 보낸 메시지, 유휴 종료와의 경합).
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly lock = new KeyedLock();

  constructor(
    private readonly repository: ConversationRepository,
    private readonly claude: ClaudeClient,
    private readonly clock: Clock,
  ) {}

  /** 스레드의 메시지에 답한다. 세션이 없으면 이 메시지로 시작한다. 종료된 세션이면 안내문을 돌려준다. */
  chat(threadId: string, message: string): Promise<string> {
    return this.lock.run(threadId, async () => {
      const session =
        (await this.repository.findSessionByThreadId(threadId)) ??
        (await this.repository.createSession({
          discordThreadId: threadId,
          topic: topicOf(message),
          startedAt: this.clock.now(),
        }));
      if (session.status === 'CLOSED') return CLOSED_NOTICE;

      const context = await this.unsummarized(session);
      await this.repository.addMessage({
        sessionId: session.id,
        role: 'USER',
        content: message,
        createdAt: this.clock.now(),
      });
      let reply;
      try {
        reply = await this.claude.completeStructured(
          {
            purpose: 'TUTOR_CHAT',
            prompt: tutorPrompt(session.topic, session.summary, context, message),
            systemPrompt: TUTOR_SYSTEM,
          },
          tutorReplySchema,
        );
      } catch (e) {
        if (!(e instanceof ClaudeException)) throw e;
        this.logger.warn(`튜터 응답 실패: thread=${threadId} ${e.type}`);
        return this.notice(e);
      }
      await this.repository.addMessage({
        sessionId: session.id,
        role: 'TUTOR',
        content: reply.reply,
        createdAt: this.clock.now(),
      });
      if (reply.answerRevealed && !session.answerRevealed) {
        await this.repository.saveSession(markAnswerRevealed(session));
      }
      return renderReply(reply);
    });
  }

  /** 요약되지 않은 메시지가 충분히 쌓였으면 오래된 것을 요약에 합친다. 응답을 보낸 뒤 부른다. 실패하면 다음 기회로 미룬다. */
  compact(threadId: string): Promise<void> {
    return this.lock.run(threadId, async () => {
      const session = await this.repository.findSessionByThreadId(threadId);
      if (session?.status !== 'ACTIVE') return;
      const older = (await this.unsummarized(session)).slice(0, -KEEP_RECENT);
      const last = older.at(-1);
      if (older.length < COMPACT_BATCH || !last) return;
      const summary = await this.summarize(session.summary, older);
      if (summary === null) return;
      await this.repository.saveSession(updateSummary(session, summary, last.id));
    });
  }

  /** `/end`. */
  end(threadId: string): Promise<EndResult> {
    return this.lock.run(threadId, async () => {
      const session = await this.repository.findSessionByThreadId(threadId);
      if (!session) return { kind: 'not-found' };
      if (session.status === 'CLOSED') return { kind: 'already-closed' };
      return { kind: 'ended', summary: await this.close(session) };
    });
  }

  /** [IDLE_TIMEOUT_MS] 동안 메시지가 없는 세션을 닫는다. 닫은 세션을 돌려준다. */
  async closeIdle(): Promise<ClosedSession[]> {
    const closed: ClosedSession[] = [];
    for (const candidate of await this.repository.findActiveSessions()) {
      const result = await this.lock.run(candidate.discordThreadId, async () => {
        // 기다리는 동안 메시지가 오거나 종료됐을 수 있어 다시 읽는다.
        const session = await this.repository.findSession(candidate.id);
        if (session?.status !== 'ACTIVE') return undefined;
        const lastActivity = (await this.repository.findLastMessage(session.id))?.createdAt ?? session.startedAt;
        if (this.clock.now().getTime() - lastActivity.getTime() < IDLE_TIMEOUT_MS) return undefined;
        return { threadId: session.discordThreadId, summary: await this.close(session) };
      });
      if (result) closed.push(result);
    }
    return closed;
  }

  /** 남은 메시지를 요약에 합치고 닫는다. 요약에 실패해도 닫는다. 호출자가 잠금을 잡고 있어야 한다. */
  private async close(session: ActiveSession): Promise<string | null> {
    const pending = await this.unsummarized(session);
    const summary =
      pending.length === 0 ? session.summary : ((await this.summarize(session.summary, pending)) ?? session.summary);
    await this.repository.saveSession(closeSession(session, summary, this.clock.now()));
    return summary;
  }

  private async summarize(previous: string | null, messages: readonly ConversationMessage[]): Promise<string | null> {
    try {
      const summary = await this.claude.complete({
        purpose: 'SESSION_SUMMARY',
        prompt: summaryPrompt(previous, messages),
        systemPrompt: SUMMARY_SYSTEM,
      });
      return summary.trim() || null;
    } catch (e) {
      if (!(e instanceof ClaudeException)) throw e;
      this.logger.warn(`세션 요약 실패: ${e.type}`);
      return null;
    }
  }

  private unsummarized(session: ActiveSession): Promise<ConversationMessage[]> {
    return this.repository.findMessagesAfter(session.id, session.summarizedMessageId ?? 0);
  }

  private notice(e: ClaudeException): string {
    switch (e.type) {
      case 'AUTH':
        return 'Claude 로그인이 만료되어 답할 수 없습니다. `#관리` 채널을 확인해 주세요.';
      case 'RATE_LIMIT': {
        const at = e.resetsAt ? ` ${formatResetTime(e.resetsAt, this.clock.timeZone)} 이후에` : ' 잠시 뒤에';
        return `Claude 사용량 한도에 도달했습니다.${at} 다시 보내 주세요.`;
      }
      default:
        return '답을 받지 못했습니다. 잠시 뒤 다시 보내 주세요.';
    }
  }
}

/** 예: `10월 13일 15:00`. */
function formatResetTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('month')}월 ${part('day')}일 ${part('hour')}:${part('minute')}`;
}
