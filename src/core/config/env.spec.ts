import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.js';

describe('validateEnv', () => {
  it('비어 있으면 기본값으로 채운다', () => {
    expect(validateEnv({})).toMatchObject({
      CLAUDE_EXECUTABLE: 'claude',
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: 5432,
      POSTGRES_DB: 'growth',
      MCP_HTTP_HOST: '127.0.0.1',
      MCP_HTTP_PORT: 3100,
    });
  });

  it('포트는 숫자로 바꾼다', () => {
    expect(validateEnv({ POSTGRES_PORT: '5433' }).POSTGRES_PORT).toBe(5433);
  });

  it('Notion 루트 ID는 쉼표로 나누고 하이픈을 지운다', () => {
    expect(validateEnv({ NOTION_ROOT_IDS: ' 3c7a-ab, ,40802bb8 ' }).NOTION_ROOT_IDS).toEqual(['3c7aab', '40802bb8']);
    expect(validateEnv({}).NOTION_ROOT_IDS).toEqual([]);
  });

  it('숫자가 아닌 포트는 거부한다', () => {
    expect(() => validateEnv({ POSTGRES_PORT: 'abc' })).toThrow(/POSTGRES_PORT/);
  });
});
