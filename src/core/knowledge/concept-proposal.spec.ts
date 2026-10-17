import { describe, expect, it } from 'vitest';
import { type ConceptProposal, planConcepts, type Vocabulary } from './concept-proposal.js';

const vocabulary: Vocabulary = {
  tracks: ['database', 'infra'],
  concepts: [
    { id: 1, name: '인덱스', aliases: ['index'], status: 'ACTIVE', track: 'database' },
    { id: 2, name: '컨테이너', aliases: ['container'], status: 'ACTIVE', track: 'infra' },
    { id: 3, name: 'GIS', aliases: [], status: 'PROPOSED', track: 'database' },
    { id: 4, name: 'ORM 매직', aliases: [], status: 'REJECTED', track: 'database' },
  ],
};

const proposal = (overrides: Partial<ConceptProposal>): ConceptProposal => ({
  name: '부분 인덱스',
  track: 'database',
  parent: '인덱스',
  description: '조건에 맞는 행만 담는 인덱스',
  aliases: [],
  confident: true,
  ...overrides,
});

describe('planConcepts', () => {
  it('승인된 개념의 하위이고 확신하면 자동 승인한다', () => {
    const plan = planConcepts(vocabulary, [proposal({})]);

    expect(plan.newConcepts).toEqual([
      {
        name: '부분 인덱스',
        track: 'database',
        description: '조건에 맞는 행만 담는 인덱스',
        aliases: [],
        status: 'ACTIVE',
        autoApproved: true,
        parentId: 1,
      },
    ]);
  });

  it.each([
    ['확신하지 않음', proposal({ confident: false }), 1],
    ['상위 개념 없음', proposal({ parent: null }), null],
    ['상위 개념이 목록에 없음', proposal({ parent: '없는 개념' }), null],
    ['상위 개념이 승인 대기', proposal({ name: '좌표계', parent: 'GIS' }), 3],
    ['상위 개념이 거절됨', proposal({ name: 'ORM 캐시', parent: 'ORM 매직' }), null],
  ])('%s이면 승인 대기로 둔다', (_, p, parentId) => {
    const [created] = planConcepts(vocabulary, [p]).newConcepts;

    expect(created).toMatchObject({ status: 'PROPOSED', autoApproved: false, parentId });
  });

  it('이름이나 별칭이 기존 개념과 같으면 새로 만들지 않고, 다른 이름은 별칭으로 더한다', () => {
    const plan = planConcepts(vocabulary, [
      proposal({ name: 'Index', parent: null }),
      proposal({ name: '도커 컨테이너', aliases: ['Container'], parent: null }),
    ]);

    expect(plan.newConcepts).toEqual([]);
    expect(plan.aliasAdds).toEqual([{ conceptId: 2, alias: '도커 컨테이너' }]);
  });

  it('거절된 개념과 같은 제안은 되살리지 않는다', () => {
    const plan = planConcepts(vocabulary, [proposal({ name: 'orm매직' })]);

    expect(plan.newConcepts).toEqual([]);
    expect(plan.aliasAdds).toEqual([]);
  });

  it('같은 제안이 두 번 오면 한 번만 만든다', () => {
    const plan = planConcepts(vocabulary, [proposal({}), proposal({ name: '부분인덱스' })]);

    expect(plan.newConcepts.map((c) => c.name)).toEqual(['부분 인덱스']);
  });

  it('모르는 트랙이면 상위 개념의 트랙을 쓰고, 상위 개념도 없으면 버린다', () => {
    const plan = planConcepts(vocabulary, [
      proposal({ name: 'Compose', track: 'devops', parent: '컨테이너' }),
      proposal({ name: 'React', track: 'frontend', parent: null }),
    ]);

    expect(plan.newConcepts.map((c) => [c.name, c.track])).toEqual([['Compose', 'infra']]);
  });

  it.each([
    ['기존 개념의 이름', 'INDEX', 1],
    ['기존 개념의 별칭', 'container', 2],
    ['승인 대기 개념', 'gis', 3],
    ['새 개념의 이름', '부분인덱스', '부분 인덱스'],
    ['새 개념의 별칭', 'partial index', '부분 인덱스'],
    ['거절된 개념', 'ORM 매직', undefined],
    ['모르는 이름', '쿠버네티스', undefined],
  ])('%s를 잇는다', (_, name, expected) => {
    const plan = planConcepts(vocabulary, [proposal({ aliases: ['partial index'] })]);

    expect(plan.resolve(name)).toBe(expected);
  });
});
