import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { Client, Events, type Interaction, type Message, MessageFlags } from 'discord.js';
import { DiscordChannels } from './discord-channels.js';
import {
  GuildMessage,
  type GuildMessageHandler,
  isGuildMessageHandler,
  isSlashCommandHandler,
  SlashCommand,
  type SlashCommandHandler,
} from './discord-handlers.js';
import { DISCORD_SETTINGS, type DiscordSettings } from './discord.settings.js';

type EnabledSettings = Extract<DiscordSettings, { enabled: true }>;

const FAILURE_NOTICE = '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';

/** 채널을 준비하고 명령을 등록한 뒤, 소유자의 이벤트만 기능 모듈 처리기로 넘긴다. */
@Injectable()
export class DiscordGateway implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DiscordGateway.name);
  private readonly commands = new Map<string, SlashCommandHandler>();
  private messageHandlers: GuildMessageHandler[] = [];

  constructor(
    private readonly client: Client,
    @Inject(DISCORD_SETTINGS) private readonly settings: DiscordSettings,
    private readonly channels: DiscordChannels,
    private readonly discovery: DiscoveryService,
  ) {}

  get commandNames(): string[] {
    return [...this.commands.keys()];
  }

  get messageHandlerCount(): number {
    return this.messageHandlers.length;
  }

  /** 처리기를 모은다. Discord를 꺼도 실행해서, 명령 이름이 겹치는 실수를 테스트에서 잡는다. */
  onModuleInit(): void {
    for (const instance of this.instances(SlashCommand.KEY)) {
      if (!isSlashCommandHandler(instance)) throw new Error(`SlashCommandHandler가 아니다: ${String(instance)}`);
      const name = instance.command.name;
      if (this.commands.has(name)) throw new Error(`슬래시 명령 이름이 겹친다: /${name}`);
      this.commands.set(name, instance);
    }
    this.messageHandlers = this.instances(GuildMessage.KEY).map((instance) => {
      if (!isGuildMessageHandler(instance)) throw new Error(`GuildMessageHandler가 아니다: ${String(instance)}`);
      return instance;
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.settings.enabled) {
      this.logger.log('Discord 접속 안 함 (DISCORD_ENABLED=false)');
      return;
    }
    await this.start(this.settings);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.destroy();
  }

  private async start(settings: EnabledSettings): Promise<void> {
    const ready = new Promise<void>((resolve) =>
      this.client.once(Events.ClientReady, () => {
        resolve();
      }),
    );
    await this.client.login(settings.token);
    await ready;

    const guild = await this.client.guilds.fetch(settings.guildId).catch(() => undefined);
    if (!guild) throw new Error(`봇이 서버 ${settings.guildId}에 초대되지 않았다`);
    await this.channels.ensureAll(guild);
    await guild.commands.set([...this.commands.values()].map((h) => h.command.toJSON()));

    // 처리기에서 난 예외가 프로세스를 끝내지 않도록 이벤트 진입점에서 모두 잡는다.
    this.client.on(Events.InteractionCreate, (interaction) => {
      this.onInteraction(interaction, settings).catch((e: unknown) => {
        this.logger.error('상호작용 처리 실패', e);
      });
    });
    this.client.on(Events.MessageCreate, (message) => {
      this.onMessage(message, settings).catch((e: unknown) => {
        this.logger.error('메시지 처리 실패', e);
      });
    });
    this.logger.log(`Discord 준비 완료: 서버 ${guild.name}, 명령 ${this.commandNames.map((n) => `/${n}`).join(' ')}`);
  }

  private async onInteraction(interaction: Interaction, settings: EnabledSettings): Promise<void> {
    if (!interaction.isChatInputCommand() || interaction.guildId !== settings.guildId) return;
    if (interaction.user.id !== settings.ownerUserId) {
      await interaction.reply({ content: '이 봇은 소유자만 쓸 수 있습니다.', flags: MessageFlags.Ephemeral });
      return;
    }
    const handler = this.commands.get(interaction.commandName);
    if (!handler) return;
    try {
      await handler.handle(interaction);
    } catch (e) {
      this.logger.error(`/${interaction.commandName} 처리 실패`, e);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: FAILURE_NOTICE, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: FAILURE_NOTICE, flags: MessageFlags.Ephemeral });
      }
    }
  }

  private async onMessage(message: Message, settings: EnabledSettings): Promise<void> {
    if (!message.inGuild() || message.guildId !== settings.guildId) return;
    if (message.author.bot || message.webhookId !== null || message.author.id !== settings.ownerUserId) return;
    for (const handler of this.messageHandlers) {
      try {
        await handler.handle(message);
      } catch (e) {
        this.logger.error(`메시지 처리 실패: ${handler.constructor.name}`, e);
      }
    }
  }

  private instances(metadataKey: string): unknown[] {
    return this.discovery.getProviders({ metadataKey }).map((wrapper): unknown => wrapper.instance);
  }
}
