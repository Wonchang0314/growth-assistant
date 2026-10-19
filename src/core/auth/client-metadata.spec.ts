import { describe, expect, it } from 'vitest';
import { parseClientIdUrl, redirectUriRegistered, verifyClientMetadata } from './client-metadata.js';

const CLIENT_ID = 'https://claude.ai/oauth/client-metadata';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const document = (overrides: Record<string, unknown> = {}) => ({
  client_id: CLIENT_ID,
  client_name: 'Claude',
  redirect_uris: [CALLBACK],
  token_endpoint_auth_method: 'none',
  ...overrides,
});

describe('parseClientIdUrl', () => {
  it('허용 호스트의 https URL을 받는다', () => {
    expect(parseClientIdUrl(CLIENT_ID, ['claude.ai']).href).toBe(CLIENT_ID);
  });

  it.each([
    ['허용하지 않는 호스트', 'https://evil.example/oauth/client'],
    ['허용 호스트의 하위 도메인', 'https://evil.claude.ai/oauth/client'],
    ['http', 'http://claude.ai/oauth/client'],
    ['포트', 'https://claude.ai:8443/oauth/client'],
    ['사용자 정보', 'https://user@claude.ai/oauth/client'],
    ['fragment', 'https://claude.ai/oauth/client#x'],
    ['경로 없음', 'https://claude.ai/'],
    ['URL이 아님', 'claude'],
  ])('%s는 거절한다', (_, clientId) => {
    expect(() => parseClientIdUrl(clientId, ['claude.ai'])).toThrow(/허용하지 않는 client_id/);
  });
});

describe('verifyClientMetadata', () => {
  it('문서의 client_name을 클라이언트 이름으로, 없으면 호스트를 쓴다', () => {
    expect(verifyClientMetadata(document(), CLIENT_ID, CALLBACK)).toEqual({ clientId: CLIENT_ID, name: 'Claude' });
    expect(verifyClientMetadata(document({ client_name: undefined }), CLIENT_ID, CALLBACK).name).toBe('claude.ai');
  });

  it.each([
    ['문서의 client_id가 주소와 다르면', document({ client_id: 'https://claude.ai/other' }), /주소와 다르다/],
    ['redirect_uri가 문서에 없으면', document({ redirect_uris: ['https://claude.ai/other'] }), /없는 redirect_uri/],
    ['기밀 클라이언트면', document({ token_endpoint_auth_method: 'client_secret_basic' }), /공개 클라이언트/],
    ['형식이 다르면', { client_id: CLIENT_ID }, /형식/],
  ])('%s 거절한다', (_, doc, message) => {
    expect(() => verifyClientMetadata(doc, CLIENT_ID, CALLBACK)).toThrow(message);
  });
});

describe('redirectUriRegistered', () => {
  const loopback = ['http://localhost/callback', 'http://127.0.0.1/callback'];

  it.each([
    ['정확히 같은 주소', [CALLBACK], CALLBACK, true],
    ['쿼리가 붙은 주소', [CALLBACK], `${CALLBACK}?x=1`, false],
    ['루프백은 포트가 달라도', loopback, 'http://localhost:53122/callback', true],
    ['루프백이라도 경로가 다르면', loopback, 'http://localhost:53122/other', false],
    ['루프백이 아니면 포트가 다를 때', ['https://claude.ai/cb'], 'https://claude.ai:444/cb', false],
    ['https 루프백은 등록된 http 루프백과', loopback, 'https://localhost:53122/callback', false],
  ])('%s → %s', (_, registered, requested, expected) => {
    expect(redirectUriRegistered(registered, requested)).toBe(expected);
  });
});
