import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { AppSettingRepository } from './app-setting.repository.js';

const testDb = connectTestDb();
const repository = new AppSettingRepository(testDb.db);

beforeEach(() => testDb.truncateAll());
afterAll(() => testDb.close());

describe('AppSettingRepository', () => {
  it('같은 키로 저장하면 값을 덮어쓴다', async () => {
    await repository.set('quiz.guideline', '1');
    await repository.set('quiz.guideline', '2');

    expect(await repository.get('quiz.guideline')).toBe('2');
    expect(await testDb.count('app_setting')).toBe(1);
  });

  it('없는 키는 undefined다', async () => {
    expect(await repository.get('없음')).toBeUndefined();
  });
});
