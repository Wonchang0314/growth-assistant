import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { AuthSettings } from './auth-settings.js';

/** 구글 id_token에서 꺼낸 신원. 서명·발급자·대상·만료는 어댑터가 검증했다. nonce·이메일 검사는 부르는 쪽 규칙이다. */
export interface GoogleIdentity {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly nonce: string | undefined;
}

/** 본인 확인을 맡기는 구글 로그인(OIDC) 포트 (바깥 경계, ADR-0015). 구글 토큰은 신원을 꺼낸 뒤 버린다. */
export abstract class GoogleLogin {
  /** 사용자를 보낼 구글 로그인 주소. 범위는 `openid email`. */
  abstract authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }): URL;
  /** 콜백으로 받은 [code]를 구글 토큰으로 바꾸고 id_token을 검증해 신원을 꺼낸다. */
  abstract exchange(code: string, codeVerifier: string): Promise<GoogleIdentity>;
}

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const TIMEOUT_MS = 10_000;

const tokenResponse = z.object({ id_token: z.string() });
const idTokenClaims = z.object({
  email: z.string(),
  email_verified: z.boolean(),
  nonce: z.string().optional(),
});

/** 구글 OIDC 어댑터. id_token 서명은 구글 공개 키(JWKS)로 검증한다(`jose`, 키는 받아 둔다). */
@Injectable()
export class GoogleOidcLogin extends GoogleLogin {
  constructor(private readonly settings: AuthSettings) {
    super();
  }

  authorizationUrl({ state, nonce, codeChallenge }: { state: string; nonce: string; codeChallenge: string }): URL {
    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.settings.google.clientId,
      redirect_uri: this.settings.googleRedirectUri,
      scope: 'openid email',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url;
  }

  async exchange(code: string, codeVerifier: string): Promise<GoogleIdentity> {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: this.settings.google.clientId,
        client_secret: this.settings.google.clientSecret,
        redirect_uri: this.settings.googleRedirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 오류 응답 본문(error, error_description)에는 비밀값이 없다.
    if (!res.ok) throw new Error(`구글 토큰 교환 실패 ${res.status}: ${await res.text()}`);
    const { id_token } = tokenResponse.parse(await res.json());

    const { payload } = await jwtVerify(id_token, JWKS, {
      issuer: ISSUERS,
      audience: this.settings.google.clientId,
      clockTolerance: 30,
    });
    const claims = idTokenClaims.parse(payload);
    return { email: claims.email, emailVerified: claims.email_verified, nonce: claims.nonce };
  }
}
