import { describe, expect, it } from 'vitest';
import { channelSettingKey, decideChannelPlan } from './discord-channel.js';

describe('decideChannelPlan', () => {
  const existing = [
    { id: '1', name: '일반' },
    { id: '2', name: '튜터' },
    { id: '3', name: '내-튜터' },
  ];

  it('저장된 ID의 채널이 있으면 이름이 바뀌었어도 그 채널을 쓴다', () => {
    expect(decideChannelPlan('TUTOR', '3', existing)).toEqual({ kind: 'use', id: '3' });
  });

  it('저장된 채널이 지워졌으면 같은 이름의 채널을 쓴다', () => {
    expect(decideChannelPlan('TUTOR', '99', existing)).toEqual({ kind: 'use', id: '2' });
  });

  it('저장된 ID도 같은 이름도 없으면 새로 만든다', () => {
    expect(decideChannelPlan('ADMIN', undefined, existing)).toEqual({ kind: 'create' });
  });

  it('채널 ID는 Kotlin 버전과 같은 app_setting 키에 저장한다', () => {
    expect(channelSettingKey('REVIEW_QUIZ')).toBe('discord.channel.review_quiz');
  });
});
