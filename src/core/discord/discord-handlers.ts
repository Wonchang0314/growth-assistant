import { DiscoveryService } from '@nestjs/core';
import type { ChatInputCommandInteraction, Message, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';

/*
 * 기능 모듈의 Discord 입력 어댑터가 구현하고, 데코레이터를 붙여 provider로 등록한다 (ADR-0015).
 * DiscordGateway가 모아서 명령을 등록하고, 소유자 검사를 통과한 이벤트만 넘긴다.
 */

export interface SlashCommandHandler {
  /** 서버 전용 명령으로 등록할 정의 (discord.js `SlashCommandBuilder`). 이름은 처리기마다 달라야 한다. */
  readonly command: { readonly name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  handle(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface GuildMessageHandler {
  /** 소유자가 개인 서버에 쓴 모든 메시지를 받는다. 자기와 관계없는 메시지는 무시한다. */
  handle(message: Message<true>): Promise<void>;
}

/** [SlashCommandHandler] 구현 클래스에 붙인다. */
export const SlashCommand = DiscoveryService.createDecorator<undefined>();

/** [GuildMessageHandler] 구현 클래스에 붙인다. */
export const GuildMessage = DiscoveryService.createDecorator<undefined>();

export function isSlashCommandHandler(value: unknown): value is SlashCommandHandler {
  return (
    isGuildMessageHandler(value) &&
    'command' in value &&
    typeof value.command === 'object' &&
    value.command !== null &&
    'name' in value.command &&
    typeof value.command.name === 'string'
  );
}

export function isGuildMessageHandler(value: unknown): value is GuildMessageHandler {
  return typeof value === 'object' && value !== null && 'handle' in value && typeof value.handle === 'function';
}
