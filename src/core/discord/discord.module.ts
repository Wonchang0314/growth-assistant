import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DiscoveryModule } from '@nestjs/core';
import { Client, GatewayIntentBits } from 'discord.js';
import type { Env } from '../config/env.js';
import { SettingModule } from '../setting/setting.module.js';
import { AdminNotifier, DiscordAdminNotifier, LoggingAdminNotifier } from './admin-notifier.js';
import { DiscordChannels } from './discord-channels.js';
import { DiscordGateway } from './discord-gateway.js';
import { DISCORD_SETTINGS, type DiscordSettings, discordSettingsFrom } from './discord.settings.js';

/**
 * Discord 입출력 기반. Discord를 꺼도 provider는 모두 등록하고, 게이트웨이가 접속만 하지 않는다.
 * 기능 모듈은 이 모듈을 import하고 `@SlashCommand()`·`@GuildMessage()` 처리기를 provider로 등록한다.
 */
@Module({
  imports: [DiscoveryModule, SettingModule],
  providers: [
    {
      provide: DISCORD_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => discordSettingsFrom(config),
    },
    {
      provide: Client,
      useFactory: () =>
        new Client({
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
          // LLM 응답에 @everyone 같은 멘션이 섞여도 알림이 가지 않게 한다.
          allowedMentions: { parse: [] },
        }),
    },
    DiscordChannels,
    DiscordGateway,
    {
      provide: AdminNotifier,
      inject: [DISCORD_SETTINGS, DiscordChannels],
      useFactory: (settings: DiscordSettings, channels: DiscordChannels) =>
        settings.enabled ? new DiscordAdminNotifier(channels) : new LoggingAdminNotifier(),
    },
  ],
  exports: [Client, DiscordChannels, AdminNotifier],
})
export class DiscordModule {}
