import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { ConversationRepository } from './conversation.repository.js';
import { closeSession, updateSummary } from './session.js';

const testDb = connectTestDb();
const repository = new ConversationRepository(testDb.db);
const now = new Date('2026-10-13T00:00:00Z');
const seconds = (n: number) => new Date(now.getTime() + n * 1000);

beforeEach(() => testDb.truncateAll());
afterAll(() => testDb.close());

describe('ConversationRepository', () => {
  it('스레드 ID로 세션을 찾고 종료 상태를 저장한다', async () => {
    const created = await repository.createSession({
      discordThreadId: '111111111111111111',
      topic: '트랜잭션 격리 수준',
      startedAt: now,
    });

    const found = await repository.findSessionByThreadId('111111111111111111');
    expect(found).toMatchObject({ id: created.id, status: 'ACTIVE', closedAt: null });
    if (found?.status !== 'ACTIVE') throw new Error('활성 세션이어야 한다');

    await repository.saveSession(closeSession(found, 'MVCC와 격리 수준을 다뤘다', seconds(600)));

    expect(await repository.findSession(created.id)).toMatchObject({
      status: 'CLOSED',
      summary: 'MVCC와 격리 수준을 다뤘다',
      closedAt: seconds(600),
    });
    expect(await repository.findActiveSessions()).toEqual([]);
  });

  it('Discord ID를 문자열 그대로 정밀도 손실 없이 저장한다', async () => {
    // 2^53보다 큰 값. number로 다루면 끝자리가 바뀐다.
    const threadId = '1427000000000000123';
    await repository.createSession({ discordThreadId: threadId, topic: null, startedAt: now });

    expect((await repository.findSessionByThreadId(threadId))?.discordThreadId).toBe(threadId);
  });

  it('같은 스레드 ID로 세션을 두 개 만들 수 없다', async () => {
    const session = { discordThreadId: '222222222222222222', topic: null, startedAt: now };
    await repository.createSession(session);

    await expect(repository.createSession(session)).rejects.toThrow();
  });

  it('요약 이후 메시지를 시간순으로, 마지막 메시지를 하나 가져온다', async () => {
    const session = await repository.createSession({
      discordThreadId: '333333333333333333',
      topic: null,
      startedAt: now,
    });
    const saved = [];
    for (let i = 1; i <= 10; i++) {
      const role = i % 2 === 1 ? 'USER' : 'TUTOR';
      saved.push(
        await repository.addMessage({ sessionId: session.id, role, content: `메시지 ${i}`, createdAt: seconds(i) }),
      );
    }
    const fourth = saved[3];
    if (!fourth) throw new Error('메시지가 저장되지 않았다');
    await repository.saveSession(updateSummary(session, '1~4 요약', fourth.id));

    const reloaded = await repository.findSession(session.id);
    const pending = await repository.findMessagesAfter(session.id, reloaded?.summarizedMessageId ?? 0);

    expect(pending.map((m) => m.content)).toEqual([5, 6, 7, 8, 9, 10].map((i) => `메시지 ${i}`));
    expect((await repository.findLastMessage(session.id))?.content).toBe('메시지 10');
  });

  it('메시지가 없으면 마지막 메시지는 undefined다', async () => {
    const session = await repository.createSession({
      discordThreadId: '444444444444444444',
      topic: null,
      startedAt: now,
    });

    expect(await repository.findLastMessage(session.id)).toBeUndefined();
  });
});
