import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { ClaudeException } from '../../core/llm/claude.client.js';
import { SUMMARY_SYSTEM, TUTOR_SYSTEM } from './conversation-prompts.js';
import { ConversationRepository } from './conversation.repository.js';
import { CLOSED_NOTICE, ConversationService } from './conversation.service.js';

const testDb = connectTestDb();
const repository = new ConversationRepository(testDb.db);
const thread = '1001001001001001001';
const otherThread = '2002002002002002002';
const MINUTE = 60_000;

let clock: FixedClock;
let claude: FakeClaudeClient;
let service: ConversationService;

beforeEach(async () => {
  await testDb.truncateAll();
  clock = new FixedClock(new Date('2026-10-13T00:00:00Z'), 'Asia/Seoul');
  claude = new FakeClaudeClient();
  service = new ConversationService(repository, claude, clock);
});
afterAll(() => testDb.close());

function tutor(reply: string, { sources = [] as { title: string; url: string }[], answerRevealed = false } = {}) {
  claude.reply(JSON.stringify({ reply, sources, answerRevealed }));
}

async function session(threadId = thread) {
  const found = await repository.findSessionByThreadId(threadId);
  if (!found) throw new Error(`세션이 없다: ${threadId}`);
  return found;
}

async function roles(threadId = thread) {
  const messages = await repository.findMessagesAfter((await session(threadId)).id, 0);
  return messages.map((m) => m.role);
}

describe('ConversationService', () => {
  it('첫 메시지로 세션을 만들고, 응답 뒤에 출처를 붙인다', async () => {
    tutor('격리 수준을 어떻게 이해하고 있나요?', {
      sources: [{ title: 'PostgreSQL 문서', url: 'https://www.postgresql.org/docs/' }],
    });

    const text = await service.chat(thread, '트랜잭션 격리 수준이 헷갈려\n특히 팬텀 리드');

    expect(text).toBe(
      '격리 수준을 어떻게 이해하고 있나요?\n\n**출처**\n- [PostgreSQL 문서](<https://www.postgresql.org/docs/>)',
    );
    expect((await session()).topic).toBe('트랜잭션 격리 수준이 헷갈려');
    expect(claude.requests).toHaveLength(1);
    const [request] = claude.requests;
    expect(request?.purpose).toBe('TUTOR_CHAT');
    expect(request?.systemPrompt).toBe(TUTOR_SYSTEM);
    expect(request?.prompt.endsWith('[이번 메시지]\n트랜잭션 격리 수준이 헷갈려\n특히 팬텀 리드')).toBe(true);
    expect(await roles()).toEqual(['USER', 'TUTOR']);
  });

  it('이어지는 메시지에는 이전 대화를 맥락으로 넣는다', async () => {
    tutor('어떻게 이해하고 있나요?');
    tutor('좋아요. 그럼 팬텀 리드는?');
    await service.chat(thread, '격리 수준');

    await service.chat(thread, '더티 리드를 막는 거');

    const prompt = claude.requests.at(-1)?.prompt;
    expect(prompt).toContain('[대화 주제]\n격리 수준');
    expect(prompt).toContain('[최근 대화]\n사용자: 격리 수준\n튜터: 어떻게 이해하고 있나요?');
    expect(prompt).not.toContain('[이전 대화 요약]');
  });

  it('답을 보여 주면 세션에 기록한다', async () => {
    tutor('정답은 MVCC입니다.', { answerRevealed: true });

    await service.chat(thread, '그냥 답 알려줘');

    expect((await session()).answerRevealed).toBe(true);
  });

  it('사용량 한도면 재개 시각을 안내하고, 사용자 메시지는 남긴다', async () => {
    claude.fail(new ClaudeException('RATE_LIMIT', 'limit', { resetsAt: new Date('2026-10-13T06:00:00Z') }));

    const text = await service.chat(thread, '질문');

    expect(text).toBe('Claude 사용량 한도에 도달했습니다. 10월 13일 15:00 이후에 다시 보내 주세요.');
    expect(await roles()).toEqual(['USER']);
  });

  it('인증 오류면 관리 채널을 확인하라고 안내한다', async () => {
    claude.fail('AUTH');

    expect(await service.chat(thread, '질문')).toContain('#관리');
  });

  it('요약되지 않은 메시지가 16개가 되면 오래된 8개를 요약에 합치고, 다음 맥락에서 뺀다', async () => {
    for (let i = 0; i < 7; i++) {
      tutor(`답 ${i}`);
      await service.chat(thread, `질문 ${i}`);
      await service.compact(thread);
    }
    expect(claude.requestsFor('SESSION_SUMMARY')).toEqual([]);

    tutor('답 7');
    await service.chat(thread, '질문 7');
    claude.reply('- 질문 0~3을 다뤘다');
    await service.compact(thread);

    const summaryRequests = claude.requestsFor('SESSION_SUMMARY');
    expect(summaryRequests).toHaveLength(1);
    expect(summaryRequests[0]?.systemPrompt).toBe(SUMMARY_SYSTEM);
    expect(summaryRequests[0]?.prompt).toContain('사용자: 질문 3\n튜터: 답 3');
    expect(summaryRequests[0]?.prompt).not.toContain('질문 4');
    expect((await session()).summary).toBe('- 질문 0~3을 다뤘다');

    tutor('답 8');
    await service.chat(thread, '질문 8');
    const prompt = claude.requests.at(-1)?.prompt;
    expect(prompt).toContain('[이전 대화 요약]\n- 질문 0~3을 다뤘다');
    expect(prompt).not.toContain('질문 3');
    expect(prompt).toContain('사용자: 질문 4');
  });

  it('end는 요약하고 닫으며, 닫힌 스레드에는 안내만 한다', async () => {
    tutor('어떻게 이해하고 있나요?');
    await service.chat(thread, '격리 수준');
    claude.reply('- 격리 수준을 다뤘다');

    expect(await service.end(thread)).toEqual({ kind: 'ended', summary: '- 격리 수준을 다뤘다' });
    expect((await session()).status).toBe('CLOSED');
    expect(await service.end(thread)).toEqual({ kind: 'already-closed' });
    expect(await service.chat(thread, '다시')).toBe(CLOSED_NOTICE);
    expect(await service.end('999999999999999999')).toEqual({ kind: 'not-found' });
  });

  it('요약에 실패해도 세션은 닫는다', async () => {
    tutor('어떻게 이해하고 있나요?');
    await service.chat(thread, '격리 수준');
    claude.fail('TIMEOUT');

    expect(await service.end(thread)).toEqual({ kind: 'ended', summary: null });
    expect((await session()).status).toBe('CLOSED');
  });

  it('마지막 메시지 후 20분이 지난 세션만 닫는다', async () => {
    tutor('답');
    await service.chat(thread, '오래된 대화');
    clock.advance(5 * MINUTE);
    tutor('답');
    await service.chat(otherThread, '최근 대화');

    clock.advance(16 * MINUTE);
    claude.reply('- 요약');
    const closed = await service.closeIdle();

    expect(closed).toEqual([{ threadId: thread, summary: '- 요약' }]);
    expect((await session(otherThread)).status).toBe('ACTIVE');
    expect((await session()).closedAt).toEqual(clock.now());
  });

  it('같은 스레드에 연달아 온 메시지는 차례로 처리해 세션을 하나만 만든다', async () => {
    tutor('답 1');
    tutor('답 2');

    await Promise.all([service.chat(thread, '첫 질문'), service.chat(thread, '바로 이어진 질문')]);

    expect(await roles()).toEqual(['USER', 'TUTOR', 'USER', 'TUTOR']);
  });
});
