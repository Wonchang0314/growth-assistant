import { expect, it } from 'vitest';
import { newTokenPair } from './token-lifetime.js';

it('토큰 쌍은 액세스 1시간, 리프레시 90일 뒤에 만료된다', () => {
  const now = new Date('2026-10-20T09:00:00Z');

  const pair = newTokenPair(now);

  expect(pair.accessExpiresAt).toEqual(new Date('2026-10-20T10:00:00Z'));
  expect(pair.refreshExpiresAt).toEqual(new Date('2027-01-18T09:00:00Z'));
  expect(pair.accessToken).not.toBe(pair.refreshToken);
});
