import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { DomainTermRepository } from './domain-term.repository.js';

const testDb = connectTestDb();
const repository = new DomainTermRepository(testDb.db);

beforeEach(() => testDb.truncateAll());
afterAll(() => testDb.close());

describe('DomainTermRepository', () => {
  it('목록으로 맞춘다: 새 용어는 넣고, 있던 용어는 고치고, 빠진 용어는 지운다', async () => {
    const now = new Date('2026-10-17T00:00:00Z');
    await repository.replaceAll(
      [
        { term: 'ACME', replacement: '고객사', isPattern: false },
        { term: 'OLD', replacement: '옛 시스템', isPattern: false },
      ],
      now,
    );

    const result = await repository.replaceAll(
      [
        { term: 'ACME', replacement: '세탁 프랜차이즈 고객사', isPattern: false },
        { term: 'TB_.*', replacement: '원천 테이블', isPattern: true },
      ],
      now,
    );

    expect(result).toEqual({ added: 1, removed: 1 });
    expect(await repository.findAll()).toEqual([
      { term: 'ACME', replacement: '세탁 프랜차이즈 고객사', isPattern: false },
      { term: 'TB_.*', replacement: '원천 테이블', isPattern: true },
    ]);
  });

  it('빈 목록이면 모두 지운다', async () => {
    await repository.replaceAll([{ term: 'ACME', replacement: '고객사', isPattern: false }], new Date());
    expect(await repository.replaceAll([], new Date())).toEqual({ added: 0, removed: 1 });
  });
});
