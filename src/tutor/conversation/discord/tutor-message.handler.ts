import { Injectable } from '@nestjs/common';
import { type Message, MessageType, type ThreadChannel } from 'discord.js';
import { DiscordChannels } from '../../../core/discord/discord-channels.js';
import { GuildMessage, type GuildMessageHandler } from '../../../core/discord/discord-handlers.js';
import { postPendingReply } from '../../../core/discord/pending-reply.js';
import { topicOf } from '../conversation-prompts.js';
import { ConversationService } from '../conversation.service.js';

/**
 * `#튜터`에 쓴 메시지는 그 메시지로 스레드를 만들어 대화를 시작하고,
 * `#튜터` 아래 스레드에 쓴 메시지는 그 스레드의 대화로 이어 간다 (설계 문서 7.2).
 */
@GuildMessage()
@Injectable()
export class TutorMessageHandler implements GuildMessageHandler {
  constructor(
    private readonly channels: DiscordChannels,
    private readonly conversations: ConversationService,
  ) {}

  async handle(message: Message<true>): Promise<void> {
    if (message.type !== MessageType.Default && message.type !== MessageType.Reply) return;
    const content = message.content.trim();
    if (content === '') return;

    const channel = message.channel;
    if (this.channels.isChannel('TUTOR', channel.id)) {
      const thread = await message.startThread({ name: topicOf(content) });
      await this.answer(thread, content);
    } else if (channel.isThread() && this.channels.isChannel('TUTOR', channel.parentId)) {
      await this.answer(channel, content);
    }
  }

  private async answer(thread: ThreadChannel, content: string): Promise<void> {
    if (!thread.isSendable()) return;
    const pending = await postPendingReply(thread);
    await pending.complete(await this.conversations.chat(thread.id, content));
    await this.conversations.compact(thread.id);
  }
}
