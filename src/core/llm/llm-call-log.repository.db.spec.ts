import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { LlmCallLogRepository } from './llm-call-log.repository.js';

const testDb = connectTestDb();
const repository = new LlmCallLogRepository(testDb.db);

beforeEach(() => testDb.truncateAll());
afterAll(() => testDb.close());

describe('LlmCallLogRepository', () => {
  it('실패한 LLM 호출도 오류 내용과 함께 기록한다', async () => {
    const saved = await repository.insert({
      purpose: 'TUTOR_CHAT',
      model: 'sonnet',
      durationMs: 1500,
      success: false,
      inputChars: 1200,
      outputChars: 0,
      error: 'RATE_LIMIT: usage limit reached',
      createdAt: new Date('2026-10-13T00:00:00Z'),
    });

    expect(await repository.findById(saved.id)).toMatchObject({
      success: false,
      error: 'RATE_LIMIT: usage limit reached',
      durationMs: 1500,
    });
  });
});
