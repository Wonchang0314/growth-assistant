import { z } from 'zod';
import { AuthorizeError } from './authorize-error.js';

/*
 * CIMD (OAuth Client ID Metadata Document) 규칙. 클라이언트를 미리 등록하지 않고, `client_id`로 받은 https URL에서
 * 클라이언트 메타데이터 문서를 읽는다. Claude는 자기 문서 URL을 `client_id`로 보낸다.
 * 문서를 가져오는 일(네트워크)은 [ClientMetadataSource] 포트가 하고, 여기는 순수 규칙만 둔다.
 */

/** 문서에서 읽는 필드만. 나머지 필드는 무시한다. */
const clientMetadataSchema = z.object({
  client_id: z.string(),
  client_name: z.string().optional(),
  redirect_uris: z.array(z.string()).min(1),
  token_endpoint_auth_method: z.string().optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
});

/** 검사를 통과한 클라이언트. 동의 화면에 보여 준다. */
export interface VerifiedClient {
  readonly clientId: string;
  /** 문서의 `client_name`. 없으면 client_id URL의 호스트. */
  readonly name: string;
}

/**
 * `client_id` 파라미터를 문서를 가져와도 되는 URL로 읽는다. 허용 호스트의 https URL만 받아
 * 내부망이나 아무 주소로 요청을 보내게 하는 SSRF를 막는다(ADR-0035). 사용자 정보·포트·fragment가 있으면 거절한다.
 */
export function parseClientIdUrl(clientId: string, allowedHosts: readonly string[]): URL {
  const url = URL.parse(clientId);
  if (
    url?.protocol !== 'https:' ||
    !allowedHosts.includes(url.hostname) ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    url.pathname === '/'
  )
    throw new AuthorizeError(400, `허용하지 않는 client_id다: ${clientId}`);
  return url;
}

/**
 * 가져온 문서가 그 `client_id`의 문서이고 [redirectUri]가 문서에 등록돼 있는지 본다.
 * 공개 클라이언트(시크릿 없음)만 받는다. 기본 방식이 다르더라도 지원 목록에 `none`이 있으면 받는다
 * (ChatGPT는 기본이 `private_key_jwt`이고 `none`도 지원해, 서버가 알린 `none`으로 토큰을 받는다).
 */
export function verifyClientMetadata(document: unknown, clientId: string, redirectUri: string): VerifiedClient {
  const parsed = clientMetadataSchema.safeParse(document);
  if (!parsed.success) throw new AuthorizeError(400, 'client_id 문서의 형식이 맞지 않다');
  const metadata = parsed.data;
  if (metadata.client_id !== clientId) throw new AuthorizeError(400, 'client_id 문서의 client_id가 주소와 다르다');
  if (
    (metadata.token_endpoint_auth_method ?? 'none') !== 'none' &&
    !metadata.token_endpoint_auth_methods_supported?.includes('none')
  )
    throw new AuthorizeError(400, '공개 클라이언트(token_endpoint_auth_method=none)만 받는다');
  if (!redirectUriRegistered(metadata.redirect_uris, redirectUri))
    throw new AuthorizeError(400, `client_id 문서에 없는 redirect_uri다: ${redirectUri}`);
  return { clientId, name: metadata.client_name ?? new URL(clientId).hostname };
}

/**
 * [requested]가 [registered]에 정확히 있는지. 다만 루프백 주소(`http://localhost`, `127.0.0.1`, `[::1]`)는
 * 포트만 다른 것을 받는다. 데스크톱 앱(Claude Code)이 빈 포트를 골라 띄우기 때문이다(RFC 8252 7.3, OAuth 2.1).
 */
export function redirectUriRegistered(registered: readonly string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  const want = loopback(requested);
  return want !== undefined && registered.some((uri) => loopback(uri) === want);
}

/** 루프백 URI면 포트를 뺀 모양, 아니면 undefined. */
function loopback(uri: string): string | undefined {
  const url = URL.parse(uri);
  if (url?.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return undefined;
  url.port = '';
  return url.href;
}
