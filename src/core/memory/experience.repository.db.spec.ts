import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { ConceptRepository } from '../knowledge/concept.repository.js';
import { concept, conceptEdge } from '../knowledge/concept.schema.js';
import type { NewConcept } from '../knowledge/concept-proposal.js';
import { type ExtractedCard, ExperienceRepository } from './experience.repository.js';
import { experience, experienceConcept } from './experience.schema.js';
import { sourceDocument } from './source-document.schema.js';
import { SourceDocumentRepository } from './source-document.repository.js';

const testDb = connectTestDb();
const repository = new ExperienceRepository(testDb.db);
const documents = new SourceDocumentRepository(testDb.db);
const now = new Date('2026-10-17T09:00:00Z');
let indexId: number;

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 0.2, description: 'DB' }],
      concepts: [{ name: '인덱스', track: 'database', aliases: [], description: '인덱스', requires: [], related: [] }],
    },
    now,
  );
  indexId = (await testDb.db.select({ id: concept.id }).from(concept))[0]?.id ?? -1;
  for (const externalId of ['a', 'b']) {
    await documents.save(
      'NOTION',
      { externalId, title: externalId, url: `https://notion.so/${externalId}`, updatedAt: now, chunks: ['본문'] },
      now,
    );
  }
});
afterAll(() => testDb.close());

const card = (title: string, concepts: ExtractedCard['concepts'] = []): ExtractedCard => ({
  projectName: 'GIS',
  title,
  situation: '상황',
  task: '과제',
  action: '행동',
  result: '결과',
  lesson: '교훈',
  occurredAt: '2026-03-02',
  concepts,
});

const partialIndex: NewConcept = {
  name: '부분 인덱스',
  track: 'database',
  description: '조건에 맞는 행만',
  aliases: ['partial index'],
  status: 'ACTIVE',
  autoApproved: true,
  parentId: null,
};

const documentId = async (externalId: string) =>
  (await testDb.db.select().from(sourceDocument).where(eq(sourceDocument.externalId, externalId)))[0]?.id ?? -1;

async function cardsOf(externalId: string) {
  const rows = await testDb.db
    .select({ title: experience.title, concept: concept.name })
    .from(experience)
    .innerJoin(sourceDocument, eq(sourceDocument.id, experience.documentId))
    .leftJoin(experienceConcept, eq(experienceConcept.experienceId, experience.id))
    .leftJoin(concept, eq(concept.id, experienceConcept.conceptId))
    .where(eq(sourceDocument.externalId, externalId))
    .orderBy(asc(experience.id), asc(concept.name));
  return rows.map((r) => [r.title, r.concept]);
}

describe('ExperienceRepository', () => {
  it('카드, 개념 연결, 새 개념, 별칭, 상위 관계를 저장하고 문서 추출을 끝낸다', async () => {
    const id = await documentId('a');

    await repository.saveExtraction({
      documentId: id,
      summary: '문서 요약',
      cards: [card('부분 인덱스로 조회 개선', [indexId, '부분 인덱스', indexId]), card('개념 없는 경험')],
      newConcepts: [{ ...partialIndex, parentId: indexId }],
      aliasAdds: [{ conceptId: indexId, alias: 'index' }],
      now,
    });

    expect(await cardsOf('a')).toEqual([
      ['부분 인덱스로 조회 개선', '부분 인덱스'],
      ['부분 인덱스로 조회 개선', '인덱스'],
      ['개념 없는 경험', null],
    ]);
    const [created] = await testDb.db.select().from(concept).where(eq(concept.name, '부분 인덱스'));
    expect(created).toMatchObject({ status: 'ACTIVE', origin: 'INGESTION', autoApproved: true, createdAt: now });
    expect(await testDb.db.select().from(conceptEdge)).toEqual([
      { fromId: created?.id, toId: indexId, type: 'PART_OF' },
    ]);
    expect((await testDb.db.select().from(concept).where(eq(concept.id, indexId)))[0]?.aliases).toEqual(['index']);
    expect((await testDb.db.select().from(sourceDocument).where(eq(sourceDocument.id, id)))[0]).toMatchObject({
      summary: '문서 요약',
      extractionStatus: 'DONE',
      lastError: null,
    });
  });

  it('다시 추출하면 그 문서의 카드만 새로 쓴다', async () => {
    const save = async (externalId: string, title: string) =>
      repository.saveExtraction({
        documentId: await documentId(externalId),
        summary: '',
        cards: [card(title, [indexId])],
        newConcepts: [],
        aliasAdds: [],
        now,
      });
    await save('a', '처음 카드');
    await save('b', '다른 문서 카드');

    await save('a', '새 카드');

    expect(await cardsOf('a')).toEqual([['새 카드', '인덱스']]);
    expect(await cardsOf('b')).toEqual([['다른 문서 카드', '인덱스']]);
  });

  it('반영 중 실패하면 아무것도 바꾸지 않는다', async () => {
    const id = await documentId('a');

    await expect(
      repository.saveExtraction({
        documentId: id,
        summary: '요약',
        cards: [card('카드', ['부분 인덱스'])],
        newConcepts: [{ ...partialIndex, track: '없는 트랙' }],
        aliasAdds: [],
        now,
      }),
    ).rejects.toThrow(/없는 트랙/);

    expect(await testDb.count('experience')).toBe(0);
    expect(await testDb.count('concept')).toBe(1);
    expect((await testDb.db.select().from(sourceDocument).where(eq(sourceDocument.id, id)))[0]?.extractionStatus).toBe(
      'PENDING',
    );
  });
});
