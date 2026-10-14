import { Injectable } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Client, SlashCommandBuilder } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { DiscordChannels } from './discord-channels.js';
import { DiscordGateway } from './discord-gateway.js';
import { GuildMessage, SlashCommand, type SlashCommandHandler } from './discord-handlers.js';
import { DISCORD_SETTINGS } from './discord.settings.js';

@SlashCommand()
@Injectable()
class EndA implements SlashCommandHandler {
  readonly command = new SlashCommandBuilder().setName('end').setDescription('a');
  handle() {
    return Promise.resolve();
  }
}

@SlashCommand()
@Injectable()
class EndB extends EndA {}

@GuildMessage()
@Injectable()
class Echo {
  handle() {
    return Promise.resolve();
  }
}

async function gatewayWith(...handlers: (new () => object)[]) {
  const app = await Test.createTestingModule({
    imports: [DiscoveryModule],
    providers: [
      DiscordGateway,
      ...handlers,
      { provide: Client, useValue: {} },
      { provide: DiscordChannels, useValue: {} },
      { provide: DISCORD_SETTINGS, useValue: { enabled: false } },
    ],
  }).compile();
  await app.init();
  return app.get(DiscordGateway);
}

describe('DiscordGateway', () => {
  it('데코레이터를 붙인 처리기를 찾아 모은다', async () => {
    const gateway = await gatewayWith(EndA, Echo);

    expect(gateway.commandNames).toEqual(['end']);
    expect(gateway.messageHandlerCount).toBe(1);
  });

  it('슬래시 명령 이름이 겹치면 시작하지 않는다', async () => {
    await expect(gatewayWith(EndA, EndB)).rejects.toThrow(/겹친다/);
  });
});
