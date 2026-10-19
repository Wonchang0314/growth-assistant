import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { createTestIngestion, emptyExtractionReply } from '../../../test/ingestion.js';
import { INGESTION_LOCK } from './ingestion-pipeline.js';
import { SyncNowTool } from './mcp/sync-now.tool.js';
import { SyncStatusTool } from './mcp/sync-status.tool.js';

const testDb = connectTestDb();
const clock = new FixedClock(new Date('2026-10-20T10:00:00+09:00'));
const ingestion = createTestIngestion(testDb.db, clock);
const { pipeline, lock, source, claude, documents } = ingestion;
const syncNow = new SyncNowTool(pipeline);
const syncStatus = new SyncStatusTool(documents, lock, clock);

const doc = (externalId: string) => ({
  externalId,
  title: `문서 ${externalId}`,
  url: `https://www.notion.so/${externalId}`,
  updatedAt: new Date('2026-10-19T00:00:00Z'),
  chunks: [`# ${externalId} 본문`],
});

beforeEach(async () => {
  await testDb.truncateAll();
  source.documents = [doc('a')];
  source.listError = undefined;
  source.gate = undefined;
});
afterAll(async () => {
  await ingestion.close();
  await testDb.close();
});

describe('IngestionPipeline', () => {
  it('동기화가 실패해도 추출은 지난번에 남은 문서로 계속한다', async () => {
    await documents.save('NOTION', doc('a'), clock.now());
    source.listError = new Error('Notion 응답 없음');
    claude.reply(emptyExtractionReply);

    const results = await pipeline.run();

    expect(results).toEqual([
      { stage: '동기화', ok: false, summary: 'Notion 응답 없음' },
      { stage: '추출', ok: true, summary: '문서 1개, 카드 0장, 실패 0' },
    ]);
  });
});

describe('sync_now', () => {
  it('뒤에서 시작하고 바로 돌아오며, 도는 동안 다시 부르면 시작하지 않고, 끝나면 다시 시작할 수 있다', async () => {
    const gate = Promise.withResolvers<undefined>();
    source.gate = gate.promise;
    claude.reply(emptyExtractionReply);

    const first = await syncNow.handle();
    const second = await syncNow.handle();
    const during = await syncStatus.handle();
    gate.resolve(undefined);
    await pipeline.idle();
    const after = await syncStatus.handle();

    expect(first.data).toEqual({ started: true });
    expect(second.data).toEqual({ started: false });
    expect(during.data).toMatchObject({ running: true });
    expect(after.data).toMatchObject({ running: false, documents: 1 });
    expect((await syncNow.handle()).data).toEqual({ started: true });
    await pipeline.idle();
  });

  it('새벽 작업이 같은 잠금을 잡고 있으면 시작하지 않는다', async () => {
    const release = await lock.tryAcquire(INGESTION_LOCK);

    const result = await syncNow.handle();
    await release?.();

    expect(result.data).toEqual({ started: false });
    expect(result.text).toContain('이미');
  });
});
