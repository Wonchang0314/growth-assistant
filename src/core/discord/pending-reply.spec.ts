import { describe, expect, it } from 'vitest';
import { isInteractionUsable } from './pending-reply.js';

describe('isInteractionUsable', () => {
  const deferredAt = new Date('2026-10-13T00:00:00Z');
  const after = (seconds: number) => new Date(deferredAt.getTime() + seconds * 1000);

  it('지연 응답 후 14분 안에는 상호작용으로 답한다', () => {
    expect(isInteractionUsable(deferredAt, after(13 * 60 + 59))).toBe(true);
  });

  it('14분이 지나면 일반 메시지로 보낸다', () => {
    expect(isInteractionUsable(deferredAt, after(14 * 60))).toBe(false);
  });
});
