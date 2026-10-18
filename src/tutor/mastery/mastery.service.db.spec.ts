import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import { MasteryRepository } from './mastery.repository.js';
import { MasteryService } from './mastery.service.js';

const testDb = connectTestDb();
const repository = new MasteryRepository(testDb.db);
const service = new MasteryService(repository);
const t0 = new Date('2026-10-18T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'cs', name: 'CS 기초', weight: 1, description: '원리' }],
      concepts: ['인덱스', '트랜잭션'].map((name) => ({
        name,
        track: 'cs',
        aliases: [],
        description: name,
        requires: [],
        related: [],
      })),
    },
    t0,
  );
});
afterAll(() => testDb.close());

describe('MasteryService', () => {
  it('학습 기록에서 다룬 개념을 지금부터 복습할 일정에 넣고, 이미 있는 일정은 건드리지 않는다', async () => {
    await service.recordAnswer({
      conceptId: 1,
      confidence: 'SURE',
      hintUsed: false,
      answeredAt: t0,
      result: 'CORRECT',
    });

    await service.introduce([1, 2], new Date(t0.getTime() + DAY));

    expect(await repository.find(1)).toMatchObject({ state: 'REVIEW', gradedAttempts: 1, masteryScore: 1 });
    expect(await repository.find(2)).toMatchObject({
      state: 'NEW',
      gradedAttempts: 0,
      dueAt: new Date(t0.getTime() + DAY),
      lastReviewAt: null,
    });
  });

  it('응답을 이어서 반영해 저장한다', async () => {
    await service.recordAnswer({
      conceptId: 1,
      confidence: 'SURE',
      hintUsed: false,
      answeredAt: t0,
      result: 'CORRECT',
    });
    const returned = await service.recordAnswer({
      conceptId: 1,
      confidence: 'SURE',
      hintUsed: false,
      answeredAt: new Date(t0.getTime() + 8 * DAY),
      result: 'WRONG',
      repeatedMisconception: false,
    });

    const saved = await repository.find(1);
    expect(saved).toEqual(returned);
    expect(saved).toMatchObject({ reps: 2, lapses: 1, gradedAttempts: 2 });
    expect(saved?.masteryScore).toBeCloseTo(0.6);
    expect(saved?.weaknessScore).toBeCloseTo(0.6);
  });

  it.each([
    ['대상에 일정이 없으면 원래 일정을 옮긴다', 1, 0, 1],
    ['원래 개념의 채점이 더 많으면 원래 일정을 남긴다', 2, 1, 2],
    ['채점 수가 같으면 대상 일정을 남긴다', 1, 1, 1],
  ] as const)('개념 병합: %s', async (_, sourceAnswers, targetAnswers, keptAttempts) => {
    const answer = (conceptId: number) =>
      service.recordAnswer({ conceptId, confidence: 'SURE', hintUsed: false, answeredAt: t0, result: 'CORRECT' });
    for (let i = 0; i < sourceAnswers; i++) await answer(1);
    for (let i = 0; i < targetAnswers; i++) await answer(2);

    await testDb.db.transaction((tx) => repository.moveConcept(tx, 1, 2));

    expect(await repository.find(1)).toBeUndefined();
    expect(await repository.find(2)).toMatchObject({ gradedAttempts: keptAttempts });
  });

  it('없는 개념에는 일정을 만들지 못한다', async () => {
    await expect(service.introduce([99], t0)).rejects.toThrow();
  });
});
