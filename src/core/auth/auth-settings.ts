import { getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/server';
import type { Env } from '../config/env.js';

type AuthEnv = Pick<
  Env,
  | 'PUBLIC_BASE_URL'
  | 'GOOGLE_OAUTH_CLIENT_ID'
  | 'GOOGLE_OAUTH_CLIENT_SECRET'
  | 'OAUTH_ALLOWED_EMAILS'
  | 'OAUTH_CLIENT_ID_HOSTS'
>;

/**
 * OAuth 인가 서버 설정. 주소는 모두 공개 주소([issuer])에서 끌어온다.
 * 환경 변수가 빠졌으면 [fromEnv]가 던져 HTTP 진입점이 뜨지 않는다(인증 없이 `/mcp`를 열지 않는다).
 */
export class AuthSettings {
  /** 인가 서버 식별자. 메타데이터의 `issuer`, 인가 응답의 `iss`. 끝에 `/`가 없다. */
  readonly issuer: string;
  /** MCP 자원 URL. 보호 리소스 메타데이터의 `resource`이고 토큰의 audience다. Claude에 넣는 주소와 정확히 같아야 한다. */
  readonly mcpUrl: string;
  /** `401`의 `WWW-Authenticate`에 실어 보내는 보호 리소스 메타데이터 주소 (RFC 9728). */
  readonly resourceMetadataUrl: string;
  /** 구글에 등록한 리디렉트 URI. */
  readonly googleRedirectUri: string;

  constructor(
    publicBaseUrl: string,
    readonly google: { readonly clientId: string; readonly clientSecret: string },
    readonly allowedEmails: readonly string[],
    readonly clientIdHosts: readonly string[],
  ) {
    this.issuer = publicBaseUrl;
    this.mcpUrl = `${publicBaseUrl}/mcp`;
    this.resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(new URL(this.mcpUrl));
    this.googleRedirectUri = `${publicBaseUrl}/oauth/google/callback`;
  }

  static fromEnv(env: AuthEnv): AuthSettings {
    const { PUBLIC_BASE_URL: base, GOOGLE_OAUTH_CLIENT_ID: clientId, GOOGLE_OAUTH_CLIENT_SECRET: clientSecret } = env;
    if (!base || !clientId || !clientSecret || env.OAUTH_ALLOWED_EMAILS.length === 0)
      throw new Error(
        'HTTP 진입점에는 PUBLIC_BASE_URL, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_ALLOWED_EMAILS가 모두 있어야 한다 (.env.example)',
      );
    return new AuthSettings(base, { clientId, clientSecret }, env.OAUTH_ALLOWED_EMAILS, env.OAUTH_CLIENT_ID_HOSTS);
  }
}
