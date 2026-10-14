import { Injectable } from '@nestjs/common';
import { type ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import { Clock } from '../../../core/clock/clock.js';
import { DiscordChannels } from '../../../core/discord/discord-channels.js';
import { SlashCommand, type SlashCommandHandler } from '../../../core/discord/discord-handlers.js';
import { deferPendingReply } from '../../../core/discord/pending-reply.js';
import { ConversationService, type EndResult } from '../conversation.service.js';
import { closedMessage } from './closed-message.js';

/** 튜터 스레드에서 `/end`: 대화를 요약하고 닫는다. */
@SlashCommand()
@Injectable()
export class EndCommandHandler implements SlashCommandHandler {
  readonly command = new SlashCommandBuilder().setName('end').setDescription('튜터 대화를 요약하고 끝냅니다');

  constructor(
    private readonly channels: DiscordChannels,
    private readonly conversations: ConversationService,
    private readonly clock: Clock,
  ) {}

  async handle(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.channel;
    if (!channel?.isThread() || !this.channels.isChannel('TUTOR', channel.parentId)) {
      await interaction.reply({
        content: '`#튜터`의 대화 스레드 안에서 쓸 수 있습니다.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const pending = await deferPendingReply(interaction, this.clock);
    await pending.complete(endMessage(await this.conversations.end(channel.id)));
  }
}

function endMessage(result: EndResult): string {
  switch (result.kind) {
    case 'ended':
      return closedMessage('대화를 종료했습니다.', result.summary);
    case 'already-closed':
      return '이미 종료된 대화입니다.';
    case 'not-found':
      return '이 스레드에는 진행 중인 대화가 없습니다.';
  }
}
