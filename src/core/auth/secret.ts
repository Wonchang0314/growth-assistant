import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/*
 * 토큰·코드·state 같은 비밀값 다루기. 비밀값은 만들어 상대에게 건네고, DB에는 해시만 남긴다.
 * DB가 새도 해시로는 토큰을 쓸 수 없다. 비밀값은 256비트 난수라 소금 없는 SHA-256으로 충분하다.
 */

/** 추측할 수 없는 비밀값 (256비트, base64url 43자). */
export const newSecret = (): string => randomBytes(32).toString('base64url');

/** DB에 저장·조회할 때 쓰는 비밀값의 해시 (SHA-256 hex). */
export const hashSecret = (secret: string): string => createHash('sha256').update(secret).digest('hex');

/** PKCE S256 (RFC 7636 4.2): `BASE64URL(SHA256(code_verifier))`. */
export const s256 = (verifier: string): string => createHash('sha256').update(verifier).digest('base64url');

/** RFC 7636 4.1: code_verifier는 비예약 문자 43~128자. code_challenge도 S256이면 43자라 같은 모양이다. */
const PKCE_VALUE = /^[A-Za-z0-9\-._~]{43,128}$/;

export const isPkceValue = (value: string): boolean => PKCE_VALUE.test(value);

/** 인가 요청 때 받은 code_challenge가 토큰 요청의 code_verifier에서 나왔는지. 길이가 같을 때만 상수 시간으로 비교한다. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!isPkceValue(verifier)) return false;
  const expected = Buffer.from(s256(verifier));
  const actual = Buffer.from(challenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
