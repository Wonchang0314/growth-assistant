/** 봇이 쓰는 채널과 채널 이름. 시작할 때 이름으로 찾고 없으면 만든다 (설계 문서 7.6). */
export const DISCORD_CHANNELS = {
  REVIEW_QUIZ: '복습-퀴즈',
  TUTOR: '튜터',
  REPORT: '리포트',
  CONCEPT_ADMIN: '개념-관리',
  ADMIN: '관리',
} as const;

export type DiscordChannel = keyof typeof DISCORD_CHANNELS;

/** 채널 ID를 저장하는 `app_setting` 키. */
export function channelSettingKey(channel: DiscordChannel): string {
  return `discord.channel.${channel.toLowerCase()}`;
}

export interface ChannelRef {
  readonly id: string;
  readonly name: string;
}

export type ChannelPlan = { readonly kind: 'use'; readonly id: string } | { readonly kind: 'create' };

/**
 * 저장된 ID의 채널이 남아 있으면 그대로 쓴다(사용자가 이름을 바꿨어도).
 * 없으면 같은 이름의 채널을 쓰고, 그것도 없으면 새로 만든다.
 */
export function decideChannelPlan(
  channel: DiscordChannel,
  storedId: string | undefined,
  existing: readonly ChannelRef[],
): ChannelPlan {
  const match = existing.find((c) => c.id === storedId) ?? existing.find((c) => c.name === DISCORD_CHANNELS[channel]);
  return match ? { kind: 'use', id: match.id } : { kind: 'create' };
}
