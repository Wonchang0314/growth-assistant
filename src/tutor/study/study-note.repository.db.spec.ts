import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import { StudyNoteRepository } from './study-note.repository.js';
import { studyNoteConcept } from './study-note.schema.js';
import type { NewStudyNote } from './study-note.js';

const testDb = connectTestDb();
const repository = new StudyNoteRepository(testDb.db);

beforeEach(() => testDb.truncateAll());
afterAll(() => testDb.close());

function note(overrides: Partial<NewStudyNote>): NewStudyNote {
  return {
    topic: '주제',
    summary: '요약',
    confusedPoints: [],
    answerRevealed: false,
    createdAt: new Date('2026-10-15T00:00:00Z'),
    ...overrides,
  };
}

describe('StudyNoteRepository', () => {
  it('개념 병합: 기록 연결을 대상 개념으로 옮기고, 한 기록에 둘 다 있으면 CONFUSED를 남긴다', async () => {
    const concepts = new ConceptRepository(testDb.db);
    await concepts.applySeed(
      {
        tracks: [{ key: 'cs', name: 'CS', weight: 1, description: 'cs' }],
        concepts: ['A', 'B'].map((name) => ({
          name,
          track: 'cs',
          aliases: [],
          description: name,
          requires: [],
          related: [],
        })),
      },
      new Date('2026-10-15T00:00:00Z'),
    );
    await repository.add(note({}), [
      { conceptId: 1, signal: 'CONFUSED' },
      { conceptId: 2, signal: 'DISCUSSED' },
    ]);
    await repository.add(note({}), [{ conceptId: 1, signal: 'DISCUSSED' }]);

    await testDb.db.transaction((tx) => repository.moveConcept(tx, 1, 2));

    expect(await repository.findByConcepts([1], 10)).toEqual([]);
    expect((await testDb.db.select().from(studyNoteConcept)).sort((a, b) => a.noteId - b.noteId)).toEqual([
      { noteId: 1, conceptId: 2, signal: 'CONFUSED' },
      { noteId: 2, conceptId: 2, signal: 'DISCUSSED' },
    ]);
  });

  it('저장한 기록을 그대로 돌려준다', async () => {
    const saved = await repository.add(
      note({ topic: '인덱스', confusedPoints: ['선택도가 낮아도 빨라진다고 생각함'], answerRevealed: true }),
    );

    expect(saved).toMatchObject({
      id: 1,
      topic: '인덱스',
      confusedPoints: ['선택도가 낮아도 빨라진다고 생각함'],
      answerRevealed: true,
    });
  });

  it('주제·요약·헷갈린 점에서 검색어를 대소문자 구분 없이 찾고 최근 것부터 돌려준다', async () => {
    await repository.add(note({ topic: 'B-Tree 인덱스', createdAt: new Date('2026-10-01T00:00:00Z') }));
    await repository.add(
      note({ topic: '트랜잭션', summary: 'MVCC와 INDEX 잠금', createdAt: new Date('2026-10-02T00:00:00Z') }),
    );
    await repository.add(
      note({
        topic: '조인',
        confusedPoints: ['인덱스가 있으면 항상 중첩 루프'],
        createdAt: new Date('2026-10-03T00:00:00Z'),
      }),
    );
    await repository.add(note({ topic: '네트워크', createdAt: new Date('2026-10-04T00:00:00Z') }));

    const found = await repository.search(['인덱스', 'index'], 10);

    expect(found.map((n) => n.topic)).toEqual(['조인', '트랜잭션', 'B-Tree 인덱스']);
  });

  it('검색어의 %와 _는 글자 그대로 찾는다', async () => {
    await repository.add(note({ topic: '100% 커버리지' }));
    await repository.add(note({ topic: '1000 커버리지' }));

    const found = await repository.search(['100%'], 10);

    expect(found.map((n) => n.topic)).toEqual(['100% 커버리지']);
  });

  it('최근 기록에서 이미 보여 준 기록을 뺀다', async () => {
    const first = await repository.add(note({ topic: '첫째', createdAt: new Date('2026-10-01T00:00:00Z') }));
    await repository.add(note({ topic: '둘째', createdAt: new Date('2026-10-02T00:00:00Z') }));
    await repository.add(note({ topic: '셋째', createdAt: new Date('2026-10-03T00:00:00Z') }));

    expect((await repository.findRecent(2)).map((n) => n.topic)).toEqual(['셋째', '둘째']);
    expect((await repository.findRecent(5, [first.id])).map((n) => n.topic)).toEqual(['셋째', '둘째']);
  });

  it('검색어가 없으면 쿼리하지 않고 빈 배열이다', async () => {
    await repository.add(note({}));

    expect(await repository.search([], 10)).toEqual([]);
  });

  describe('개념 연결', () => {
    const concepts = new ConceptRepository(testDb.db);
    let index: number;
    let tcp: number;

    beforeEach(async () => {
      const description = '설명';
      await concepts.applySeed(
        {
          tracks: [{ key: 'cs', name: 'CS 기초', weight: 1, description }],
          concepts: ['인덱스 원리', 'TCP'].map((name) => ({
            name,
            track: 'cs',
            aliases: [],
            description,
            requires: [],
            related: [],
          })),
        },
        new Date(),
      );
      const terms = await concepts.findActiveTerms();
      index = terms.find((t) => t.name === '인덱스 원리')?.id ?? -1;
      tcp = terms.find((t) => t.name === 'TCP')?.id ?? -1;
    });

    it('기록과 연결을 함께 저장하고, 개념으로 기록을 최근 것부터 찾는다', async () => {
      await repository.add(note({ topic: '옛 인덱스', createdAt: new Date('2026-10-01T00:00:00Z') }), [
        { conceptId: index, signal: 'CONFUSED' },
      ]);
      await repository.add(note({ topic: '새 인덱스', createdAt: new Date('2026-10-02T00:00:00Z') }), [
        { conceptId: index, signal: 'DISCUSSED' },
        { conceptId: tcp, signal: 'DISCUSSED' },
      ]);
      await repository.add(note({ topic: '연결 없음' }));

      expect((await repository.findByConcepts([index], 10)).map((n) => n.topic)).toEqual(['새 인덱스', '옛 인덱스']);
      expect((await repository.findByConcepts([tcp], 10)).map((n) => n.topic)).toEqual(['새 인덱스']);
      expect(await repository.findByConcepts([], 10)).toEqual([]);
      expect(await testDb.count('study_note_concept')).toBe(3);
    });

    it('연결이 실패하면 기록도 남기지 않는다', async () => {
      await expect(repository.add(note({}), [{ conceptId: 9999, signal: 'DISCUSSED' }])).rejects.toThrow();

      expect(await testDb.count('study_note')).toBe(0);
    });
  });
});
