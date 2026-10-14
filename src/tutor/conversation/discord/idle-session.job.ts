import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Client } from 'discord.js';
import { splitMessage } from '../../../core/discord/message-splitter.js';
import { ConversationService, IDLE_TIMEOUT_MS } from '../conversation.service.js';
import { closedMessage } from './closed-message.js';

/** 1분마다 유휴 세션을 닫고 그 스레드에 요약을 남긴다. */
@Injectable()
export class IdleSessionJob {
  private readonly logger = new Logger(IdleSessionJob.name);
  /** 요약이 오래 걸려 1분을 넘기면 다음 실행을 건너뛴다(@Interval은 이전 실행이 끝나기를 기다리지 않는다). */
  private running = false;

  constructor(
    private readonly conversations: ConversationService,
    private readonly client: Client,
  ) {}

  @Interval(60_000)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.closeIdleSessions();
    } catch (e) {
      this.logger.error('유휴 세션 종료 실패', e);
    } finally {
      this.running = false;
    }
  }

  private async closeIdleSessions(): Promise<void> {
    const minutes = IDLE_TIMEOUT_MS / 60_000;
    for (const closed of await this.conversations.closeIdle()) {
      const text = closedMessage(`${minutes}분 동안 대화가 없어 종료했습니다.`, closed.summary);
      try {
        const thread = await this.client.channels.fetch(closed.threadId);
        if (!thread?.isSendable()) continue;
        for (const part of splitMessage(text)) await thread.send(part);
      } catch (e) {
        this.logger.warn(`유휴 종료 안내 실패: thread=${closed.threadId} ${String(e)}`);
      }
    }
  }
}
