import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/** 켜져 있을 때만 토큰·ID가 있다. 끈 실행(테스트 등)에서는 Discord에 접속하지 않는다. */
export type DiscordSettings =
  | { readonly enabled: false }
  | {
      readonly enabled: true;
      readonly token: string;
      /** 봇이 동작할 개인 서버. 다른 서버의 이벤트는 무시한다. */
      readonly guildId: string;
      /** 봇을 쓸 수 있는 유일한 사용자. */
      readonly ownerUserId: string;
    };

export const DISCORD_SETTINGS = Symbol('DISCORD_SETTINGS');

export function discordSettingsFrom(config: ConfigService<Env, true>): DiscordSettings {
  if (!config.get('DISCORD_ENABLED', { infer: true })) return { enabled: false };
  const token = config.get('DISCORD_BOT_TOKEN', { infer: true });
  const guildId = config.get('DISCORD_GUILD_ID', { infer: true });
  const ownerUserId = config.get('DISCORD_OWNER_USER_ID', { infer: true });
  // 환경 변수 검증(env.ts)이 이미 확인했지만, 타입을 좁히려고 다시 확인한다.
  if (!token || !guildId || !ownerUserId) throw new Error('Discord가 켜져 있으면 토큰과 서버·소유자 ID가 필요하다');
  return { enabled: true, token, guildId, ownerUserId };
}
