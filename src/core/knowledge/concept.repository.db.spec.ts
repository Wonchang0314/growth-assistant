import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { ConceptRepository } from './concept.repository.js';
import { concept } from './concept.schema.js';
import type { ConceptSeed, SeedConcept } from './concept-seed.js';

const testDb = connectTestDb();
const repository = new ConceptRepository(testDb.db);
const now = new Date('2026-10-16T00:00:00Z');

beforeEach(() => testDb.truncateAll());
afterAll(() => testDb.close());

function c(name: string, overrides: Partial<SeedConcept> = {}): SeedConcept {
  return { name, track: 'cs', aliases: [], description: `${name} 설명`, requires: [], related: [], ...overrides };
}

const seed: ConceptSeed = {
  tracks: [
    { key: 'cs', name: 'CS 기초', weight: 0.3, description: '원리' },
    { key: 'backend', name: '백엔드', weight: 0.3, description: '애플리케이션' },
  ],
  concepts: [
    c('인덱스 원리', { aliases: ['인덱스'] }),
    c('B-tree 인덱스', { parent: '인덱스 원리' }),
    c('선택도와 스캔 방식', { parent: '인덱스 원리', requires: ['B-tree 인덱스'] }),
    c('실행계획 읽기', { track: 'backend', requires: ['선택도와 스캔 방식'], related: ['B-tree 인덱스'] }),
  ],
};

const idOf = async (name: string) =>
  (await testDb.db.select({ id: concept.id }).from(concept).where(eq(concept.name, name)))[0]?.id ?? -1;

describe('ConceptRepository', () => {
  it('시드를 적재하고, 다시 적재해도 결과가 같다', async () => {
    const first = await repository.applySeed(seed, now);
    const second = await repository.applySeed(seed, now);

    expect(first).toEqual({ tracks: 2, concepts: 4, newConcepts: 4, newEdges: 5 });
    expect(second).toEqual({ tracks: 2, concepts: 4, newConcepts: 0, newEdges: 0 });
    expect(await testDb.count('concept_edge')).toBe(5);
  });

  it('다시 적재하면 설명·별칭은 시드대로 고치고 승인 상태는 건드리지 않는다', async () => {
    await repository.applySeed(seed, now);
    await testDb.db.update(concept).set({ status: 'REJECTED' }).where(eq(concept.name, 'B-tree 인덱스'));

    const changed: ConceptSeed = {
      ...seed,
      concepts: seed.concepts.map((x) =>
        x.name === 'B-tree 인덱스' ? { ...x, description: '바뀐 설명', aliases: ['btree'] } : x,
      ),
    };
    await repository.applySeed(changed, now);

    const [row] = await testDb.db.select().from(concept).where(eq(concept.name, 'B-tree 인덱스'));
    expect(row).toMatchObject({ description: '바뀐 설명', aliases: ['btree'], status: 'REJECTED', origin: 'SEED' });
  });

  it('승인된 개념만 이름 매칭 대상으로 돌려준다', async () => {
    await repository.applySeed(seed, now);
    await testDb.db.update(concept).set({ status: 'PROPOSED' }).where(eq(concept.name, '실행계획 읽기'));

    const terms = await repository.findActiveTerms();

    expect(terms.map((t) => t.name)).toEqual(['인덱스 원리', 'B-tree 인덱스', '선택도와 스캔 방식']);
    expect(terms[0]?.aliases).toEqual(['인덱스']);
  });

  it('요약에 트랙 이름과 상위 개념을 담아 요청한 순서대로 돌려준다', async () => {
    await repository.applySeed(seed, now);
    const ids = [await idOf('실행계획 읽기'), await idOf('B-tree 인덱스')];

    const summaries = await repository.findSummaries(ids);

    expect(summaries).toEqual([
      { id: ids[0], name: '실행계획 읽기', track: '백엔드', description: '실행계획 읽기 설명', parent: null },
      { id: ids[1], name: 'B-tree 인덱스', track: 'CS 기초', description: 'B-tree 인덱스 설명', parent: '인덱스 원리' },
    ]);
  });

  it('선수 개념을 정한 깊이까지 따라가 가까운 것부터 돌려준다', async () => {
    await repository.applySeed(seed, now);
    const plan = await idOf('실행계획 읽기');

    expect((await repository.findPrerequisites([plan], 2)).get(plan)).toEqual(['선택도와 스캔 방식', 'B-tree 인덱스']);
    expect((await repository.findPrerequisites([plan], 1)).get(plan)).toEqual(['선택도와 스캔 방식']);
    expect((await repository.findPrerequisites([await idOf('인덱스 원리')], 2)).size).toBe(0);
  });
});
