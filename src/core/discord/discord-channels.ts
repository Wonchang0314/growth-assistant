import { Injectable, Logger } from '@nestjs/common';
import { ChannelType, Client, type Guild, type TextChannel } from 'discord.js';
import { AppSettingRepository } from '../setting/app-setting.repository.js';
import {
  type ChannelRef,
  channelSettingKey,
  DISCORD_CHANNELS,
  type DiscordChannel,
  decideChannelPlan,
} from './discord-channel.js';

/** 봇 채널의 ID를 관리한다. 시작할 때 [ensureAll]로 채널을 찾거나 만들고 ID를 `app_setting`에 저장한다. */
@Injectable()
export class DiscordChannels {
  private readonly logger = new Logger(DiscordChannels.name);
  private readonly ids = new Map<DiscordChannel, string>();

  constructor(
    private readonly client: Client,
    private readonly settings: AppSettingRepository,
  ) {}

  async ensureAll(guild: Guild): Promise<void> {
    const existing: ChannelRef[] = [...(await guild.channels.fetch()).values()]
      .filter((c) => c?.type === ChannelType.GuildText)
      .map((c) => ({ id: c.id, name: c.name }));

    for (const channel of Object.keys(DISCORD_CHANNELS) as DiscordChannel[]) {
      const key = channelSettingKey(channel);
      const storedId = await this.settings.get(key);
      const plan = decideChannelPlan(channel, storedId, existing);
      const id = plan.kind === 'use' ? plan.id : await this.create(guild, channel);
      if (id !== storedId) await this.settings.set(key, id);
      this.ids.set(channel, id);
    }
  }

  textChannel(channel: DiscordChannel): TextChannel {
    const id = this.ids.get(channel);
    if (id === undefined) throw new Error(`채널이 아직 준비되지 않았다: ${channel}`);
    const found = this.client.channels.cache.get(id);
    if (found?.type !== ChannelType.GuildText) {
      throw new Error(`채널을 찾을 수 없다: #${DISCORD_CHANNELS[channel]} (${id})`);
    }
    return found;
  }

  isChannel(channel: DiscordChannel, channelId: string | null | undefined): boolean {
    return channelId != null && this.ids.get(channel) === channelId;
  }

  private async create(guild: Guild, channel: DiscordChannel): Promise<string> {
    const name = DISCORD_CHANNELS[channel];
    const created = await guild.channels.create({ name, type: ChannelType.GuildText });
    this.logger.log(`채널을 만들었다: #${name} (${created.id})`);
    return created.id;
  }
}
