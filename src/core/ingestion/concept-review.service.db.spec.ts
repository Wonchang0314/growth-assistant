import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { ConceptRepository } from '../knowledge/concept.repository.js';
import { concept, conceptEdge } from '../knowledge/concept.schema.js';
import { ConceptService } from '../knowledge/concept.service.js';
import type { NewConcept } from '../knowledge/concept-proposal.js';
import { DecisionCaseRepository } from '../memory/decision-case.repository.js';
import { decisionCaseConcept } from '../memory/decision-case.schema.js';
import { type ExtractedCard, ExperienceRepository } from '../memory/experience.repository.js';
import { experience, experienceConcept } from '../memory/experience.schema.js';
import { SourceDocumentRepository } from '../memory/source-document.repository.js';
import { ConceptReviewRepository } from './concept-review.repository.js';
import { ConceptReviewService } from './concept-review.service.js';

const testDb = connectTestDb();
const clock = new FixedClock(new Date('2026-10-17T09:00:00Z'));
const service = new ConceptReviewService(
  new ConceptReviewRepository(testDb.db),
  new ConceptService(new ConceptRepository(testDb.db)),
  clock,
);

const proposed = (name: string, overrides: Partial<NewConcept> = {}): NewConcept => ({
  name,
  track: 'database',
  description: `${name} 설명`,
  aliases: [],
  status: 'PROPOSED',
  autoApproved: false,
  parentId: null,
  ...overrides,
});

const card = (title: string, concepts: ExtractedCard['concepts']): ExtractedCard => ({
  projectName: null,
  title,
  situation: '상황',
  task: '과제',
  action: '행동',
  result: '결과',
  lesson: '교훈',
  occurredAt: null,
  concepts,
});

let indexId: number;

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [
        { key: 'database', name: '관계형 DB', weight: 0.2, description: 'DB' },
        { key: 'infra', name: 'IT 인프라', weight: 0.2, description: '인프라' },
      ],
      concepts: [
        { name: '인덱스', track: 'database', aliases: ['index'], description: '인덱스', requires: [], related: [] },
      ],
    },
    clock.now(),
  );
  indexId = (await testDb.db.select({ id: concept.id }).from(concept))[0]?.id ?? -1;
  const documents = new SourceDocumentRepository(testDb.db);
  await documents.save(
    'NOTION',
    { externalId: 'a', title: 'a', url: 'https://notion.so/a', updatedAt: clock.now(), chunks: ['본문'] },
    clock.now(),
  );
  const [doc] = await documents.findForExtraction({});
  await new ExperienceRepository(testDb.db).saveExtraction({
    documentId: doc?.id ?? -1,
    summary: '',
    cards: [
      card('공간 인덱스로 반경 질의', ['공간 인덱스와 PostGIS', indexId]),
      card('GiST와 btree 구분', ['공간 인덱스와 PostGIS', '부분 인덱스']),
      card('CI 잡이 막힘', ['CI 잡 직렬화']),
    ],
    newConcepts: [
      proposed('공간 인덱스와 PostGIS', { aliases: ['GiST', 'ST_DWithin'] }),
      proposed('부분 인덱스', { status: 'ACTIVE', autoApproved: true, parentId: indexId }),
      proposed('CI 잡 직렬화', { track: 'infra' }),
    ],
    aliasAdds: [],
    now: clock.now(),
  });
});
afterAll(() => testDb.close());

const conceptNamed = async (name: string) => (await testDb.db.select().from(concept).where(eq(concept.name, name)))[0];

async function cardConcepts() {
  const rows = await testDb.db
    .select({ title: experience.title, concept: concept.name })
    .from(experienceConcept)
    .innerJoin(experience, eq(experience.id, experienceConcept.experienceId))
    .innerJoin(concept, eq(concept.id, experienceConcept.conceptId))
    .orderBy(asc(experience.id), asc(concept.name));
  return rows.map((r) => `${r.title} → ${r.concept}`);
}

describe('ConceptReviewService', () => {
  it('승인 대기 개념과 사람이 아직 보지 않은 자동 승인 개념을 카드가 많은 것부터 보여 준다', async () => {
    expect(await service.listPending(10)).toEqual([
      {
        name: '공간 인덱스와 PostGIS',
        status: 'PROPOSED',
        track: 'database',
        parent: null,
        description: '공간 인덱스와 PostGIS 설명',
        aliases: ['GiST', 'ST_DWithin'],
        cardCount: 2,
        cardTitles: ['공간 인덱스로 반경 질의', 'GiST와 btree 구분'],
      },
      expect.objectContaining({ name: '부분 인덱스', status: 'ACTIVE', parent: '인덱스', cardCount: 1 }),
      expect.objectContaining({ name: 'CI 잡 직렬화', status: 'PROPOSED', track: 'infra', cardCount: 1 }),
    ]);
    expect(await service.listPending(1)).toHaveLength(1);
  });

  it('고쳐서 승인하면 이름·트랙·상위 개념·설명·별칭을 바꾸고 목록에서 빠진다', async () => {
    const text = await service.review({
      concept: '공간인덱스와 postgis',
      decision: {
        kind: 'APPROVE',
        edit: {
          name: '공간 인덱스',
          parent: 'index',
          description: '좌표 범위로 찾는 인덱스',
          aliases: ['spatial index'],
        },
      },
    });

    expect(text).toBe('승인: 공간 인덱스 (이전 이름 공간 인덱스와 PostGIS)');
    const approved = await conceptNamed('공간 인덱스');
    expect(approved).toMatchObject({
      status: 'ACTIVE',
      autoApproved: false,
      description: '좌표 범위로 찾는 인덱스',
      aliases: ['spatial index'],
      updatedAt: clock.now(),
    });
    expect(
      await testDb.db
        .select()
        .from(conceptEdge)
        .where(eq(conceptEdge.fromId, approved?.id ?? -1)),
    ).toEqual([{ fromId: approved?.id, toId: indexId, type: 'PART_OF' }]);
    expect((await service.listPending(10)).map((c) => c.name)).toEqual(['부분 인덱스', 'CI 잡 직렬화']);
  });

  it('자동 승인 개념을 그대로 승인하면 사람이 본 것으로 남고, 상위 개념을 null로 주면 관계를 지운다', async () => {
    await service.review({ concept: '부분 인덱스', decision: { kind: 'APPROVE', edit: { parent: null } } });

    expect(await conceptNamed('부분 인덱스')).toMatchObject({ status: 'ACTIVE', autoApproved: false });
    expect(await testDb.count('concept_edge')).toBe(0);
  });

  it('병합하면 카드 연결을 대상 개념으로 옮기고, 이름과 별칭을 대상의 별칭으로 남긴 뒤 지운다', async () => {
    await service.review({ concept: '부분 인덱스', decision: { kind: 'APPROVE', edit: {} } });

    const text = await service.review({
      concept: '공간 인덱스와 PostGIS',
      decision: { kind: 'MERGE', into: '인덱스' },
    });

    expect(text).toBe('병합: 공간 인덱스와 PostGIS → 인덱스 (카드 연결 2개)');
    expect(await conceptNamed('공간 인덱스와 PostGIS')).toBeUndefined();
    expect((await conceptNamed('인덱스'))?.aliases).toEqual(['index', '공간 인덱스와 PostGIS', 'GiST', 'ST_DWithin']);
    expect(await cardConcepts()).toEqual([
      '공간 인덱스로 반경 질의 → 인덱스',
      'GiST와 btree 구분 → 부분 인덱스',
      'GiST와 btree 구분 → 인덱스',
      'CI 잡이 막힘 → CI 잡 직렬화',
    ]);
  });

  it('병합하면 판단 사례의 개념 연결도 대상 개념으로 옮긴다', async () => {
    await new DecisionCaseRepository(testDb.db).save({
      experienceId: 2,
      kind: 'EXPERIENCE',
      body: {
        situation: '상황',
        constraints: [],
        options: [
          { text: 'GiST', chosen: true, reason: '범위 질의' },
          { text: 'btree', chosen: false, reason: '공간 연산 불가' },
        ],
        decision: '결정',
        rationale: '근거',
        outcome: '결과',
        invariants: ['불변'],
      },
      status: 'ACTIVE',
      reviewNote: null,
      now: clock.now(),
    });

    await service.review({ concept: '공간 인덱스와 PostGIS', decision: { kind: 'MERGE', into: '인덱스' } });

    const linked = await testDb.db
      .select({ concept: concept.name })
      .from(decisionCaseConcept)
      .innerJoin(concept, eq(concept.id, decisionCaseConcept.conceptId))
      .orderBy(asc(concept.name));
    expect(linked.map((r) => r.concept)).toEqual(['부분 인덱스', '인덱스']);
  });

  it('병합한 개념의 하위 개념은 대상 개념 아래로 옮긴다', async () => {
    await service.review({ concept: 'CI 잡 직렬화', decision: { kind: 'APPROVE', edit: { parent: '부분 인덱스' } } });

    await service.review({ concept: '부분 인덱스', decision: { kind: 'MERGE', into: '인덱스' } });

    expect(await testDb.db.select().from(conceptEdge)).toEqual([
      { fromId: (await conceptNamed('CI 잡 직렬화'))?.id, toId: indexId, type: 'PART_OF' },
    ]);
  });

  it('거절하면 REJECTED로 두고 목록에서 뺀다', async () => {
    expect(await service.review({ concept: 'CI 잡 직렬화', decision: { kind: 'REJECT' } })).toBe('거절: CI 잡 직렬화');

    expect(await conceptNamed('CI 잡 직렬화')).toMatchObject({ status: 'REJECTED', autoApproved: false });
    expect((await service.listPending(10)).map((c) => c.name)).not.toContain('CI 잡 직렬화');
  });

  it.each([
    ['없는 개념', { concept: '쿠버네티스', decision: { kind: 'REJECT' } }, /개념 목록에 없다: 쿠버네티스/],
    ['시드 개념', { concept: 'index', decision: { kind: 'REJECT' } }, /시드 개념은 YAML로 고친다: 인덱스/],
    ['자기 자신으로 병합', { concept: '부분 인덱스', decision: { kind: 'MERGE', into: '부분인덱스' } }, /자기 자신/],
    [
      '없는 대상으로 병합',
      { concept: '부분 인덱스', decision: { kind: 'MERGE', into: '없음' } },
      /개념 목록에 없다: 없음/,
    ],
    [
      '모르는 트랙',
      { concept: '부분 인덱스', decision: { kind: 'APPROVE', edit: { track: 'frontend' } } },
      /없는 트랙/,
    ],
    ['없는 상위 개념', { concept: '부분 인덱스', decision: { kind: 'APPROVE', edit: { parent: '없음' } } }, /없음/],
    ['겹치는 새 이름', { concept: '부분 인덱스', decision: { kind: 'APPROVE', edit: { name: 'Index' } } }, /이미 있다/],
  ] as const)('%s이면 아무것도 바꾸지 않고 오류를 낸다', async (_, input, error) => {
    await expect(service.review(input)).rejects.toThrow(error);
    expect(await service.listPending(10)).toHaveLength(3);
  });

  it('거절된 개념으로는 병합하지 않는다', async () => {
    await service.review({ concept: 'CI 잡 직렬화', decision: { kind: 'REJECT' } });

    await expect(
      service.review({ concept: '부분 인덱스', decision: { kind: 'MERGE', into: 'CI 잡 직렬화' } }),
    ).rejects.toThrow(/거절된 개념으로 병합할 수 없다/);
  });
});
