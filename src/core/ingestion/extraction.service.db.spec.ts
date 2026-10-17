import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { ConceptRepository } from '../knowledge/concept.repository.js';
import { concept } from '../knowledge/concept.schema.js';
import { ConceptService } from '../knowledge/concept.service.js';
import { ExperienceRepository } from '../memory/experience.repository.js';
import { experience } from '../memory/experience.schema.js';
import { sourceDocument } from '../memory/source-document.schema.js';
import { SourceDocumentRepository } from '../memory/source-document.repository.js';
import type { Extraction } from './extraction.js';
import { ExtractionService } from './extraction.service.js';

const testDb = connectTestDb();
const documents = new SourceDocumentRepository(testDb.db);
const clock = new FixedClock(new Date('2026-10-17T09:00:00Z'));
let claude: FakeClaudeClient;
let service: ExtractionService;

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 0.2, description: 'DB' }],
      concepts: [
        { name: '인덱스', track: 'database', aliases: ['index'], description: '인덱스', requires: [], related: [] },
      ],
    },
    clock.now(),
  );
  for (const externalId of ['a', 'b', 'c']) {
    await documents.save(
      'NOTION',
      {
        externalId,
        title: `문서 ${externalId}`,
        url: `https://notion.so/${externalId}`,
        updatedAt: clock.now(),
        chunks: [`# ${externalId} 본문`, '둘째 청크'],
      },
      clock.now(),
    );
  }
  claude = new FakeClaudeClient();
  service = new ExtractionService(
    claude,
    documents,
    new ExperienceRepository(testDb.db),
    new ConceptService(new ConceptRepository(testDb.db)),
    clock,
  );
});
afterAll(() => testDb.close());

const extraction = (overrides: Partial<Extraction> = {}): string =>
  JSON.stringify({
    summary: '요약',
    experiences: [
      {
        projectName: null,
        title: '부분 인덱스로 조회를 줄임',
        situation: '상황',
        task: '과제',
        action: '행동',
        result: '결과',
        lesson: '교훈',
        occurredAt: null,
        concepts: ['Index', '부분 인덱스', '없는 개념'],
      },
    ],
    newConcepts: [
      {
        name: '부분 인덱스',
        track: 'database',
        parent: '인덱스',
        description: '조건에 맞는 행만',
        aliases: [],
        confident: true,
      },
      { name: '공간 인덱스', track: 'database', parent: null, description: 'GiST', aliases: [], confident: false },
    ],
    ...overrides,
  } satisfies Extraction);

const statusOf = async (title: string) =>
  (await testDb.db.select().from(sourceDocument).where(eq(sourceDocument.title, title)))[0];

describe('ExtractionService', () => {
  it('문서에서 카드를 뽑아 개념에 잇고, 제안 개념은 승인 정책대로 저장한다', async () => {
    claude.reply(extraction());

    const report = await service.run({ limit: 1 });

    expect(report).toEqual({ done: 1, cards: 1, autoApproved: 1, proposed: 1, failed: [], stopped: null });
    const [request] = claude.requestsFor('EXTRACTION');
    expect(request?.prompt).toContain('# a 본문\n\n둘째 청크');
    expect(request?.prompt).toContain('- 인덱스 (database) 별칭: index');
    const concepts = await testDb.db
      .select({ name: concept.name, status: concept.status })
      .from(concept)
      .orderBy(asc(concept.id));
    expect(concepts).toEqual([
      { name: '인덱스', status: 'ACTIVE' },
      { name: '부분 인덱스', status: 'ACTIVE' },
      { name: '공간 인덱스', status: 'PROPOSED' },
    ]);
    expect(await testDb.count('experience_concept')).toBe(2);
    expect(await statusOf('문서 a')).toMatchObject({ extractionStatus: 'DONE', summary: '요약' });
    expect(await statusOf('문서 b')).toMatchObject({ extractionStatus: 'PENDING' });
  });

  it('실패한 문서는 FAILED로 두고 다음 문서를 계속하며, 다음 실행에서 다시 뽑는다', async () => {
    claude.fail('INVALID_OUTPUT', '스키마와 다른 응답').reply(extraction()).reply(extraction());

    const first = await service.run({});
    expect(first).toMatchObject({ done: 2, failed: [{ title: '문서 a', error: '스키마와 다른 응답' }] });
    expect(await statusOf('문서 a')).toMatchObject({ extractionStatus: 'FAILED', lastError: '스키마와 다른 응답' });

    claude.reply(extraction({ newConcepts: [] }));
    expect(await service.run({})).toMatchObject({ done: 1, failed: [] });
    expect(await statusOf('문서 a')).toMatchObject({ extractionStatus: 'DONE', lastError: null });
  });

  it('사용량 한도에 걸리면 그 문서를 실패로 두지 않고 멈춘다', async () => {
    claude.reply(extraction()).fail('RATE_LIMIT', '한도 초과');

    expect(await service.run({})).toMatchObject({ done: 1, failed: [], stopped: 'RATE_LIMIT: 한도 초과' });
    expect(claude.requests).toHaveLength(2);
    expect(await statusOf('문서 b')).toMatchObject({ extractionStatus: 'PENDING' });
  });

  it('id를 주면 이미 뽑은 문서도 다시 뽑고 카드를 바꾼다', async () => {
    claude.reply(extraction()).reply(extraction({ experiences: [] }));
    await service.run({ limit: 1 });
    const id = (await statusOf('문서 a'))?.id ?? -1;

    expect(await service.run({ ids: [id] })).toMatchObject({ done: 1, cards: 0 });
    expect(await testDb.db.select().from(experience)).toEqual([]);
  });
});
