import { describe, expect, it } from 'vitest';
import { validateEnv } from '../config/env.js';
import { AuthSettings } from './auth-settings.js';

const env = {
  PUBLIC_BASE_URL: 'https://mcp.seok.app/',
  GOOGLE_OAUTH_CLIENT_ID: 'id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'secret',
  OAUTH_ALLOWED_EMAILS: ' Me@Example.com , ',
};

describe('AuthSettings', () => {
  it('공개 주소에서 issuer·MCP URL·메타데이터 주소·구글 콜백을 끌어온다', () => {
    const settings = AuthSettings.fromEnv(validateEnv(env));

    expect(settings).toMatchObject({
      issuer: 'https://mcp.seok.app',
      mcpUrl: 'https://mcp.seok.app/mcp',
      resourceMetadataUrl: 'https://mcp.seok.app/.well-known/oauth-protected-resource/mcp',
      googleRedirectUri: 'https://mcp.seok.app/oauth/google/callback',
      allowedEmails: ['me@example.com'],
      clientIdHosts: ['claude.ai', 'chatgpt.com'],
    });
  });

  it.each(['PUBLIC_BASE_URL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET', 'OAUTH_ALLOWED_EMAILS'])(
    '%s가 없으면 시작하지 않는다',
    (key) => {
      expect(() => AuthSettings.fromEnv(validateEnv({ ...env, [key]: undefined }))).toThrow(key);
    },
  );
});
