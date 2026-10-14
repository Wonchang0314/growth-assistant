import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

const discord = {
  DISCORD_BOT_TOKEN: 'token',
  DISCORD_GUILD_ID: '123456789012345678',
  DISCORD_OWNER_USER_ID: '876543210987654321',
};

describe('validateEnv', () => {
  it('Discord를 끄면 나머지는 기본값으로 채운다', () => {
    const env = validateEnv({ DISCORD_ENABLED: 'false' });

    expect(env).toMatchObject({
      DISCORD_ENABLED: false,
      CLAUDE_EXECUTABLE: 'claude',
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: 5432,
      POSTGRES_DB: 'growth',
    });
  });

  it('Discord는 기본으로 켜져 있고, 켜져 있으면 토큰과 ID가 필요하다', () => {
    expect(() => validateEnv({})).toThrow(/DISCORD_BOT_TOKEN/);
    expect(validateEnv(discord).DISCORD_ENABLED).toBe(true);
  });

  it('Discord ID는 숫자 문자열 그대로 둔다 (JS number로는 정밀도가 깨진다)', () => {
    const env = validateEnv(discord);

    expect(env.DISCORD_GUILD_ID).toBe('123456789012345678');
  });

  it('숫자가 아닌 Discord ID는 거부한다', () => {
    expect(() => validateEnv({ ...discord, DISCORD_GUILD_ID: 'abc' })).toThrow(/DISCORD_GUILD_ID/);
  });

  it('포트는 숫자로 바꾼다', () => {
    expect(validateEnv({ DISCORD_ENABLED: 'false', POSTGRES_PORT: '5433' }).POSTGRES_PORT).toBe(5433);
  });
});
