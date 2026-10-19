import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { expect } from 'vitest';
import { z } from 'zod';
import { TEST_CLIENT } from './fakes/fake-client-metadata-source.js';
import { TEST_MCP_URL } from './mcp-app.js';

/*
 * OAuth 흐름을 Claude(클라이언트)와 브라우저 쪽에서 밟는 시험 도우미. 리디렉트는 따라가지 않고(`redirect: 'manual'`)
 * Location을 읽어 다음 단계로 넘긴다. 가짜 구글은 로그인 주소의 nonce를 콜백 code로 받는다(FakeGoogleLogin).
 */

/** RFC 7636 부록 B의 PKCE 예시 값. */
export const PKCE = {
  verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
} as const;

const tokenBody = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string(),
});
export type TokenBody = z.infer<typeof tokenBody>;

/** `/token` 성공 응답 본문. */
export const parseTokenBody = async (res: Response): Promise<TokenBody> => tokenBody.parse(await res.json());

const get = (url: URL) => fetch(url, { redirect: 'manual' });
const location = (res: Response) => new URL(res.headers.get('location') ?? '');

/** ② `/authorize`. [params]로 기본 요청 파라미터를 바꾸거나(undefined면 뺀다) 더한다. */
export function authorize(baseUrl: string, params: Record<string, string | undefined> = {}): Promise<Response> {
  const url = new URL('/authorize', baseUrl);
  const all: Record<string, string | undefined> = {
    response_type: 'code',
    client_id: TEST_CLIENT.clientId,
    redirect_uri: TEST_CLIENT.redirectUri,
    code_challenge: PKCE.challenge,
    code_challenge_method: 'S256',
    state: 'client-state',
    resource: TEST_MCP_URL,
    ...params,
  };
  for (const [key, value] of Object.entries(all)) if (value !== undefined) url.searchParams.set(key, value);
  return get(url);
}

/** ②→③ 구글로 보내진 뒤 구글 로그인을 마치고 콜백으로 돌아온 응답(동의 화면). */
export async function loginWithGoogle(baseUrl: string): Promise<Response> {
  const res = await authorize(baseUrl);
  expect(res.status).toBe(302);
  const google = location(res);
  const callback = new URL('/oauth/google/callback', baseUrl);
  callback.searchParams.set('state', google.searchParams.get('state') ?? '');
  callback.searchParams.set('code', google.searchParams.get('nonce') ?? '');
  return get(callback);
}

/** 동의 화면 폼에 숨겨 둔 값. */
export const consentToken = (html: string): string => /name="consent_token" value="([^"]+)"/.exec(html)?.[1] ?? '';

/** ④ 동의 화면에서 버튼을 누른다. */
export function submitConsent(baseUrl: string, token: string, decision: 'allow' | 'deny'): Promise<Response> {
  return fetch(new URL('/oauth/consent', baseUrl), {
    method: 'POST',
    body: new URLSearchParams({ consent_token: token, decision }),
    redirect: 'manual',
  });
}

/** ⑤ `/token` (form-urlencoded). */
export function requestToken(baseUrl: string, form: Record<string, string>): Promise<Response> {
  return fetch(new URL('/token', baseUrl), { method: 'POST', body: new URLSearchParams(form) });
}

/** ②~④를 허용으로 마치고 클라이언트 redirect_uri로 받은 인가 코드. */
export async function authorizationCode(baseUrl: string): Promise<string> {
  const consent = await loginWithGoogle(baseUrl);
  const res = await submitConsent(baseUrl, consentToken(await consent.text()), 'allow');
  expect(res.status).toBe(303);
  return location(res).searchParams.get('code') ?? '';
}

export const codeGrant = (code: string) => ({
  grant_type: 'authorization_code',
  code,
  redirect_uri: TEST_CLIENT.redirectUri,
  client_id: TEST_CLIENT.clientId,
  code_verifier: PKCE.verifier,
  resource: TEST_MCP_URL,
});

export const refreshGrant = (refreshToken: string) => ({
  grant_type: 'refresh_token',
  refresh_token: refreshToken,
  client_id: TEST_CLIENT.clientId,
});

/** ⑥ 액세스 토큰을 실어 `/mcp`에 붙은 MCP 클라이언트. */
export async function connectMcp(baseUrl: string, accessToken: string): Promise<Client> {
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', baseUrl), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    }),
  );
  return client;
}

/** `/mcp`에 MCP 요청 하나를 보낸 응답. 인증 결과(401 여부)만 볼 때 쓴다. */
export function postMcp(baseUrl: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(new URL('/mcp', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** 처음부터 끝까지 로그인해 받은 토큰. */
export async function signIn(baseUrl: string): Promise<TokenBody> {
  const res = await requestToken(baseUrl, codeGrant(await authorizationCode(baseUrl)));
  expect(res.status).toBe(200);
  return parseTokenBody(res);
}
