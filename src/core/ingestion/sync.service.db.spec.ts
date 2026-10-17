import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeDocumentSource } from '../../../test/fakes/fake-document-source.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { SourceDocumentRepository } from '../memory/source-document.repository.js';
import { documentChunk, sourceDocument } from '../memory/source-document.schema.js';
import type { FetchedDocument } from '../memory/source-document.js';
import { SyncService } from './sync.service.js';

const testDb = connectTestDb();
const repository = new SourceDocumentRepository(testDb.db);
let clock: FixedClock;
let source: FakeDocumentSource;
let service: SyncService;

beforeEach(async () => {
  await testDb.truncateAll();
  clock = new FixedClock(new Date('2026-10-17T09:00:00Z'));
  source = new FakeDocumentSource();
  service = new SyncService(source, repository, clock);
});
afterAll(() => testDb.close());

const doc = (externalId: string, chunks: string[], updatedAt = '2026-10-16T00:00:00Z'): FetchedDocument => ({
  externalId,
  title: `문서 ${externalId}`,
  url: `https://www.notion.so/${externalId}`,
  updatedAt: new Date(updatedAt),
  chunks,
});

async function chunksOf(externalId: string) {
  const rows = await testDb.db
    .select({ content: documentChunk.content })
    .from(documentChunk)
    .innerJoin(sourceDocument, eq(documentChunk.documentId, sourceDocument.id))
    .where(eq(sourceDocument.externalId, externalId))
    .orderBy(asc(documentChunk.seq));
  return rows.map((r) => r.content);
}

async function documentOf(externalId: string) {
  const [row] = await testDb.db.select().from(sourceDocument).where(eq(sourceDocument.externalId, externalId));
  return row;
}

describe('SyncService', () => {
  it('처음에는 모두 저장하고, 수정 시각이 같으면 다음에는 본문을 읽지 않는다', async () => {
    source.documents = [doc('a', ['하나', '둘']), doc('b', ['셋'])];

    expect(await service.run()).toMatchObject({ listed: 2, created: 2, addedChunks: 3, failed: [] });
    expect(await chunksOf('a')).toEqual(['하나', '둘']);

    source.fetched.length = 0;
    expect(await service.run()).toMatchObject({ created: 0, skipped: 2 });
    expect(source.fetched).toEqual([]);
  });

  it('본문이 바뀌면 청크를 다시 쓰고 추출을 PENDING으로 돌린다', async () => {
    source.documents = [doc('a', ['하나', '둘'])];
    await service.run();
    await testDb.db.update(sourceDocument).set({ extractionStatus: 'DONE' });

    source.documents = [doc('a', ['하나', '바뀐 둘'], '2026-10-17T00:00:00Z')];
    expect(await service.run()).toMatchObject({ changed: 1, addedChunks: 1, removedChunks: 1 });
    expect(await chunksOf('a')).toEqual(['하나', '바뀐 둘']);
    expect((await documentOf('a'))?.extractionStatus).toBe('PENDING');
  });

  it('수정 시각만 바뀌고 본문이 같으면 추출 상태를 그대로 둔다', async () => {
    source.documents = [doc('a', ['하나'])];
    await service.run();
    await testDb.db.update(sourceDocument).set({ extractionStatus: 'DONE' });

    source.documents = [doc('a', ['하나'], '2026-10-17T00:00:00Z')];
    expect(await service.run()).toMatchObject({ unchanged: 1 });
    expect(await documentOf('a')).toMatchObject({
      extractionStatus: 'DONE',
      sourceUpdatedAt: new Date('2026-10-17T00:00:00Z'),
    });
  });

  it('원천에서 사라진 문서는 청크와 함께 지운다', async () => {
    source.documents = [doc('a', ['하나']), doc('b', ['둘'])];
    await service.run();

    source.documents = [doc('a', ['하나'])];
    expect(await service.run()).toMatchObject({ deleted: 1 });
    expect(await documentOf('b')).toBeUndefined();
    expect(await testDb.count('document_chunk')).toBe(1);
  });

  it('실패한 문서는 건너뛰고 다음 동기화에서 다시 읽는다', async () => {
    source.documents = [doc('a', ['하나']), doc('b', ['둘'])];
    source.failing.add('b');

    const first = await service.run();
    expect(first).toMatchObject({ created: 1, deleted: 0 });
    expect(first.failed).toEqual([{ title: '문서 b', error: '읽기 실패: b' }]);

    source.failing.clear();
    expect(await service.run()).toMatchObject({ created: 1, skipped: 1 });
  });

  it('범위 안 문서가 하나도 없으면 저장된 문서를 지우지 않고 멈춘다', async () => {
    source.documents = [doc('a', ['하나'])];
    await service.run();

    source.documents = [];
    await expect(service.run()).rejects.toThrow(/NOTION_ROOT_IDS/);
    expect(await testDb.count('source_document')).toBe(1);
  });

  it('상태에 마지막 동기화 시각과 문서·청크 수를 보여 준다', async () => {
    source.documents = [doc('a', ['하나', '둘'])];
    await service.run();
    expect(await repository.status('NOTION')).toEqual({
      lastSyncedAt: clock.now(),
      documents: 1,
      chunks: 2,
      byExtractionStatus: { PENDING: 1 },
    });
  });
});
