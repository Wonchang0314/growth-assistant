import { request } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectTestDb } from './db/test-db.js';
import { FakeAdminNotifier } from './fakes/fake-admin-notifier.js';
import { FakeClientMetadataSource, TEST_CLIENT } from './fakes/fake-client-metadata-source.js';
import { FakeGoogleLogin } from './fakes/fake-google-login.js';
import { FixedClock } from './fakes/fixed-clock.js';
import { createMcpHttpApp, TEST_ALLOWED_EMAIL, TEST_MCP_URL, TEST_PUBLIC_BASE_URL } from './mcp-app.js';
import {
  authorizationCode,
  authorize,
  bearer,
  codeGrant,
  connectMcp,
  consentToken,
  loginWithGoogle,
  parseTokenBody,
  postMcp,
  refreshGrant,
  requestToken,
  signIn,
  submitConsent,
} from './oauth-client.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const testDb = connectTestDb();
const clock = new FixedClock(new Date('2026-10-20T09:00:00+09:00'));
const google = new FakeGoogleLogin();
const clients = new FakeClientMetadataSource();
const notifier = new FakeAdminNotifier();
let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await createMcpHttpApp(clock, { google, clients, notifier });
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});
beforeEach(async () => {
  await testDb.truncateAll();
  google.identity = { email: TEST_ALLOWED_EMAIL, emailVerified: true };
  notifier.alerts.length = 0;
});
afterAll(async () => {
  await app.close();
  await testDb.close();
  vi.unstubAllEnvs();
});

const json = async (path: string): Promise<unknown> => (await fetch(new URL(path, baseUrl))).json();
const location = (res: Response) => new URL(res.headers.get('location') ?? '');

describe('① 탐색', () => {
  it('토큰 없는 /mcp는 401과 보호 리소스 메타데이터 주소를 준다', async () => {
    const res = await postMcp(baseUrl);

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(
      `Bearer error="invalid_token", error_description="Missing bearer token", resource_metadata="${TEST_PUBLIC_BASE_URL}/.well-known/oauth-protected-resource/mcp"`,
    );
  });

  it('보호 리소스 메타데이터의 resource는 MCP URL이고 경로 없는 주소에서도 같은 문서를 준다', async () => {
    const document = await json('/.well-known/oauth-protected-resource/mcp');

    expect(document).toMatchObject({ resource: TEST_MCP_URL, authorization_servers: [TEST_PUBLIC_BASE_URL] });
    expect(await json('/.well-known/oauth-protected-resource')).toEqual(document);
  });

  it('인가 서버 메타데이터는 CIMD·PKCE S256·공개 클라이언트를 알린다', async () => {
    expect(await json('/.well-known/oauth-authorization-server')).toMatchObject({
      issuer: TEST_PUBLIC_BASE_URL,
      authorization_endpoint: `${TEST_PUBLIC_BASE_URL}/authorize`,
      token_endpoint: `${TEST_PUBLIC_BASE_URL}/token`,
      code_challenge_methods_supported: ['S256'],
      client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ['none'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
    });
  });
});

describe('②~④ 로그인과 동의', () => {
  it('/authorize는 CIMD 문서를 읽고 state·nonce·PKCE를 붙여 구글로 보낸다', async () => {
    const res = await authorize(baseUrl);

    expect(res.status).toBe(302);
    const google = location(res);
    expect(google.origin).toBe('https://accounts.google.test');
    expect([...google.searchParams.keys()].sort()).toEqual(['codeChallenge', 'nonce', 'state']);
    expect(clients.fetched).toContain(TEST_CLIENT.clientId);
  });

  it('구글 로그인 뒤 동의 화면에 클라이언트 이름·client_id·돌아갈 호스트를 보여 준다', async () => {
    const res = await loginWithGoogle(baseUrl);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(html).toContain('Claude');
    expect(html).toContain(TEST_CLIENT.clientId);
    expect(html).toContain('claude.ai');
    expect(html).toContain(TEST_ALLOWED_EMAIL);
    expect(consentToken(html)).not.toBe('');
  });

  it('허용하면 클라이언트 redirect_uri로 1회용 코드·state·iss를 보낸다', async () => {
    const consent = await loginWithGoogle(baseUrl);
    const res = await submitConsent(baseUrl, consentToken(await consent.text()), 'allow');

    expect(res.status).toBe(303);
    const redirect = location(res);
    expect(redirect.origin + redirect.pathname).toBe(TEST_CLIENT.redirectUri);
    expect(redirect.searchParams.get('code')).toBeTruthy();
    expect(redirect.searchParams.get('state')).toBe('client-state');
    expect(redirect.searchParams.get('iss')).toBe(TEST_PUBLIC_BASE_URL);
  });

  it('거절하면 access_denied로 돌려보내고, 같은 동의 화면으로 다시 낼 수 없다', async () => {
    const token = consentToken(await (await loginWithGoogle(baseUrl)).text());
    const res = await submitConsent(baseUrl, token, 'deny');

    expect(location(res).searchParams.get('error')).toBe('access_denied');
    expect(location(res).searchParams.get('code')).toBeNull();
    expect((await submitConsent(baseUrl, token, 'allow')).status).toBe(400);
  });

  it.each([
    ['허용 목록에 없는 이메일', { email: 'other@example.com', emailVerified: true }],
    ['구글이 확인하지 않은 이메일', { email: TEST_ALLOWED_EMAIL, emailVerified: false }],
  ])('%s은 동의 화면 없이 403 오류 화면이고 운영 알림을 보낸다', async (_, identity) => {
    google.identity = identity;
    const res = await loginWithGoogle(baseUrl);

    expect(res.status).toBe(403);
    expect(consentToken(await res.text())).toBe('');
    expect(await testDb.count('oauth_authorization_request')).toBe(0);
    expect(notifier.alerts.map((a) => a.kind)).toEqual(['LOGIN_REJECTED']);
  });

  it.each([
    ['허용하지 않는 호스트의 client_id', { client_id: 'https://evil.example/oauth/client' }],
    ['https가 아닌 client_id', { client_id: 'http://claude.ai/oauth/test-client-metadata' }],
    ['CIMD 문서에 없는 redirect_uri', { redirect_uri: 'https://evil.example/callback' }],
    ['가져올 수 없는 CIMD 문서', { client_id: 'https://claude.ai/oauth/missing' }],
  ])('%s면 클라이언트로 돌려보내지 않고 400 오류 화면이다', async (_, params) => {
    const res = await authorize(baseUrl, params);

    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
  });

  it('클라이언트를 확인한 뒤의 잘못된 요청은 redirect_uri로 오류를 돌려준다', async () => {
    const res = await authorize(baseUrl, { code_challenge_method: 'plain' });

    expect(res.status).toBe(302);
    expect(location(res).origin).toBe('https://claude.ai');
    expect(location(res).searchParams.get('error')).toBe('invalid_request');
  });
});

describe('⑤ 토큰과 ⑥ /mcp', () => {
  it('코드를 토큰으로 바꾸면 no-store로 1시간짜리 액세스 토큰을 주고 /mcp 도구를 부를 수 있다', async () => {
    const res = await requestToken(baseUrl, codeGrant(await authorizationCode(baseUrl)));
    const tokens = await parseTokenBody(res);

    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
    const client = await connectMcp(baseUrl, tokens.access_token);
    expect((await client.callTool({ name: 'sync_status', arguments: {} })).isError).toBeFalsy();
    await client.close();
  });

  it('인가 코드는 한 번만 쓴다', async () => {
    const code = await authorizationCode(baseUrl);
    await requestToken(baseUrl, codeGrant(code));
    const again = await requestToken(baseUrl, codeGrant(code));

    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it.each([
    ['code_verifier가 다르면', { code_verifier: 'x'.repeat(43) }],
    ['redirect_uri가 다르면', { redirect_uri: 'https://claude.ai/other' }],
    ['client_id가 다르면', { client_id: 'https://claude.ai/oauth/other' }],
  ])('%s invalid_grant다', async (_, override) => {
    const res = await requestToken(baseUrl, { ...codeGrant(await authorizationCode(baseUrl)), ...override });

    expect(await res.json()).toMatchObject({ error: 'invalid_grant' });
  });

  it('모르는 grant_type은 unsupported_grant_type이다', async () => {
    const res = await requestToken(baseUrl, { grant_type: 'password' });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'unsupported_grant_type' });
  });

  it('액세스 토큰은 1시간 뒤 401이고, 리프레시하면 다시 된다', async () => {
    const tokens = await signIn(baseUrl);
    clock.advance(HOUR);

    expect((await postMcp(baseUrl, bearer(tokens.access_token))).status).toBe(401);
    const refreshed = await parseTokenBody(await requestToken(baseUrl, refreshGrant(tokens.refresh_token)));
    expect((await postMcp(baseUrl, bearer(refreshed.access_token))).status).toBe(200);
  });

  it('리프레시 토큰을 90일 동안 쓰지 않으면 다시 로그인해야 한다', async () => {
    const tokens = await signIn(baseUrl);
    clock.advance(90 * DAY);

    expect(await (await requestToken(baseUrl, refreshGrant(tokens.refresh_token))).json()).toMatchObject({
      error: 'invalid_grant',
    });
  });

  it('리프레시하면 회전하고, 회전한 토큰이 다시 오면 계열 전체를 폐기하고 알린다', async () => {
    const first = await signIn(baseUrl);
    const second = await parseTokenBody(await requestToken(baseUrl, refreshGrant(first.refresh_token)));
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await postMcp(baseUrl, bearer(second.access_token))).status).toBe(200);

    const reused = await requestToken(baseUrl, refreshGrant(first.refresh_token));

    expect(await reused.json()).toMatchObject({ error: 'invalid_grant' });
    expect(notifier.alerts.map((a) => a.kind)).toEqual(['REFRESH_TOKEN_REUSE']);
    expect((await postMcp(baseUrl, bearer(second.access_token))).status).toBe(401);
    expect((await requestToken(baseUrl, refreshGrant(second.refresh_token))).status).toBe(400);
  });

  it('모르는 토큰은 401이고, 다른 사이트의 Origin은 토큰보다 먼저 403이다', async () => {
    const tokens = await signIn(baseUrl);

    expect((await postMcp(baseUrl, bearer('unknown'))).status).toBe(401);
    // 받는 클라이언트의 Origin(ChatGPT)은 Origin 검사를 지나 토큰 검사(401)까지 간다.
    expect((await postMcp(baseUrl, { origin: 'https://chatgpt.com' })).status).toBe(401);
    expect((await postMcp(baseUrl, { ...bearer(tokens.access_token), origin: 'https://evil.example' })).status).toBe(
      403,
    );
  });

  it('Host가 공개 호스트(터널)면 받고, 모르는 호스트면 403이다', async () => {
    const { access_token } = await signIn(baseUrl);

    expect(await mcpStatusWithHost(new URL(TEST_PUBLIC_BASE_URL).host, access_token)).toBe(200);
    expect(await mcpStatusWithHost('evil.example', access_token)).toBe(403);
  });
});

/** fetch는 Host 헤더를 바꾸지 못하므로 node:http로 보낸다. */
function mcpStatusWithHost(host: string, accessToken: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    const req = request(
      new URL('/mcp', baseUrl),
      {
        method: 'POST',
        headers: {
          host,
          ...bearer(accessToken),
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
  });
}
