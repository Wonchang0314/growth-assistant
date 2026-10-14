import { describe, expect, it } from 'vitest';
import { type ActiveSession, closeSession, markAnswerRevealed, updateSummary } from './session.js';

const startedAt = new Date('2026-10-13T00:00:00Z');

const active: ActiveSession = {
  id: 1,
  discordThreadId: '123456789012345678',
  topic: '트랜잭션 격리 수준',
  status: 'ACTIVE',
  summary: null,
  summarizedMessageId: null,
  answerRevealed: false,
  startedAt,
  closedAt: null,
};

describe('session', () => {
  it('닫으면 요약과 종료 시각을 남긴다', () => {
    const at = new Date('2026-10-13T00:10:00Z');

    const closed = closeSession(active, 'MVCC를 다뤘다', at);

    expect(closed).toMatchObject({ status: 'CLOSED', summary: 'MVCC를 다뤘다', closedAt: at });
    expect(active.status).toBe('ACTIVE');
  });

  it('요약을 갱신하면 요약에 합친 마지막 메시지 ID를 기억한다', () => {
    const updated = updateSummary(active, '1~4 요약', 4);

    expect(updated).toMatchObject({ status: 'ACTIVE', summary: '1~4 요약', summarizedMessageId: 4 });
  });

  it('정답 공개 여부를 표시한다', () => {
    expect(markAnswerRevealed(active).answerRevealed).toBe(true);
  });
});
