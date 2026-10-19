import { describe, expect, it } from 'vitest';
import { hashSecret, newSecret, verifyPkce } from './secret.js';

// RFC 7636 부록 B의 예시 값
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE S256', () => {
  it('RFC 예시의 code_verifier는 그 code_challenge와 맞는다', () => {
    expect(verifyPkce(VERIFIER, CHALLENGE)).toBe(true);
  });

  it.each([
    ['다른 verifier', `${VERIFIER.slice(0, -1)}A`],
    ['43자보다 짧은 verifier', VERIFIER.slice(0, 42)],
    ['허용하지 않는 문자가 든 verifier', `${VERIFIER.slice(0, -1)}+`],
  ])('%s는 거절한다', (_, verifier) => {
    expect(verifyPkce(verifier, CHALLENGE)).toBe(false);
  });
});

describe('비밀값', () => {
  it('매번 다른 43자 값을 만들고, 해시는 같은 값에 같은 64자 hex다', () => {
    const secret = newSecret();

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSecret()).not.toBe(secret);
    expect(hashSecret(secret)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSecret(secret)).toBe(hashSecret(secret));
  });
});
