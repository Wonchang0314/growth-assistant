import { pgTable, text, varchar } from 'drizzle-orm/pg-core';

/** 실행 중에 정해지는 키-값 설정 (예: 출제 지침 `quiz.guideline`). */
export const appSetting = pgTable('app_setting', {
  key: varchar('key', { length: 128 }).primaryKey(),
  value: text('value').notNull(),
});
