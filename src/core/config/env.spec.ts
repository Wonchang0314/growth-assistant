import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('비어 있으면 기본값으로 채운다', () => {
    expect(validateEnv({})).toMatchObject({
      CLAUDE_EXECUTABLE: 'claude',
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: 5432,
      POSTGRES_DB: 'growth',
    });
  });

  it('포트는 숫자로 바꾼다', () => {
    expect(validateEnv({ POSTGRES_PORT: '5433' }).POSTGRES_PORT).toBe(5433);
  });

  it('숫자가 아닌 포트는 거부한다', () => {
    expect(() => validateEnv({ POSTGRES_PORT: 'abc' })).toThrow(/POSTGRES_PORT/);
  });
});
