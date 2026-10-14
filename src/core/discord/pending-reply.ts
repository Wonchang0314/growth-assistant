import { type ChatInputCommandInteraction, DiscordAPIError, type SendableChannels } from 'discord.js';
import type { Clock } from '../clock/clock.js';
import { splitMessage } from './message-splitter.js';

/**
 * 오래 걸리는 응답을 위한 자리. 먼저 "생각 중…"을 보여 주고, [complete]로 결과를 채운다.
 * 결과가 2000자를 넘으면 나눠서 이어 보낸다.
 */
export interface PendingReply {
  complete(text: string): Promise<void>;
}

export const THINKING = '생각 중…';

/** 상호작용 토큰 유효 시간(15분)보다 여유를 둔다. */
const INTERACTION_TTL_MS = 14 * 60 * 1000;

export function isInteractionUsable(deferredAt: Date, now: Date): boolean {
  return now.getTime() - deferredAt.getTime() < INTERACTION_TTL_MS;
}

/** 일반 메시지에 대한 응답: 자리 메시지를 보내고 나중에 수정한다. */
export async function postPendingReply(channel: SendableChannels): Promise<PendingReply> {
  const placeholder = await channel.send(THINKING);
  return {
    async complete(text) {
      const [first, ...rest] = parts(text);
      await placeholder.edit(first);
      for (const part of rest) await channel.send(part);
    },
  };
}

/** 슬래시 명령에 대한 응답: 지연 응답 후 원본을 수정한다. 상호작용 토큰이 만료되면 일반 메시지로 보낸다. */
export async function deferPendingReply(interaction: ChatInputCommandInteraction, clock: Clock): Promise<PendingReply> {
  await interaction.deferReply();
  const deferredAt = clock.now();
  return {
    async complete(text) {
      const all = parts(text);
      if (isInteractionUsable(deferredAt, clock.now())) {
        try {
          const [first, ...rest] = all;
          await interaction.editReply(first);
          for (const part of rest) await interaction.followUp(part);
          return;
        } catch (e) {
          // 토큰이 예상보다 먼저 만료됐다. 아래에서 일반 메시지로 보낸다.
          if (!(e instanceof DiscordAPIError)) throw e;
        }
      }
      const channel = interaction.channel;
      if (!channel?.isSendable()) throw new Error(`응답을 보낼 수 없는 채널: ${interaction.channelId}`);
      for (const part of all) await channel.send(part);
    },
  };
}

function parts(text: string): [string, ...string[]] {
  const [first = '(빈 응답)', ...rest] = splitMessage(text);
  return [first, ...rest];
}
