import { GoogleLogin, type GoogleIdentity } from '../../src/core/auth/google-login.js';

/**
 * 네트워크 없이 구글 로그인을 흉내 낸다. 로그인 주소에 state·nonce를 그대로 싣고, 콜백 코드로 받은 값을
 * id_token의 nonce로 돌려준다(진짜 구글은 로그인 주소의 nonce를 id_token에 넣는다). 신원은 [identity]로 정한다.
 */
export class FakeGoogleLogin extends GoogleLogin {
  identity: Omit<GoogleIdentity, 'nonce'> = { email: 'me@example.com', emailVerified: true };
  /** 마지막 [exchange]가 받은 code_verifier. */
  lastCodeVerifier: string | undefined;

  authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }): URL {
    const url = new URL('https://accounts.google.test/auth');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url;
  }

  exchange(code: string, codeVerifier: string): Promise<GoogleIdentity> {
    this.lastCodeVerifier = codeVerifier;
    return Promise.resolve({ ...this.identity, nonce: code });
  }
}
