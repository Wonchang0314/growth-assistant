import { newSecret } from './secret.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 인가 흐름에서 만드는 값의 수명 (ms). 액세스·리프레시는 사용자가 정했다(2026-10-20), 나머지는 관례. */
export const LIFETIME = {
  /** `/authorize`에서 구글 로그인과 동의 화면을 마칠 때까지. */
  authorizationRequest: 10 * MINUTE,
  /** 인가 코드. 클라이언트가 리디렉트를 받자마자 바꾸므로 짧게 둔다. */
  authorizationCode: 5 * MINUTE,
  accessToken: HOUR,
  /** 회전할 때마다 새로 90일. 90일 동안 갱신하지 않으면 다시 로그인한다. */
  refreshToken: 90 * DAY,
} as const;

export const expiresAfter = (now: Date, lifetimeMs: number): Date => new Date(now.getTime() + lifetimeMs);

/** 토큰 응답 한 번에 주는 액세스·리프레시 토큰과 만료 시각. */
export function newTokenPair(now: Date) {
  return {
    accessToken: newSecret(),
    accessExpiresAt: expiresAfter(now, LIFETIME.accessToken),
    refreshToken: newSecret(),
    refreshExpiresAt: expiresAfter(now, LIFETIME.refreshToken),
  };
}

export type TokenPair = ReturnType<typeof newTokenPair>;
