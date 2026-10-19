import { sql } from 'drizzle-orm';
import { check, date, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';
import { inList } from '../db/sql.js';

export const JOB_STATUSES = ['RUNNING', 'SUCCEEDED', 'FAILED'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/**
 * 예약 작업마다 마지막 실행 (설계 문서 5.5). 서버가 뜰 때 이것으로 놓친 실행을 찾는다.
 * `slot_date`는 그 실행이 맡은 날짜(Asia/Seoul)이고 시작할 때 적는다. 도중에 프로세스가 죽어도 그날 다시 돌리지 않는다.
 */
export const scheduledJob = pgTable(
  'scheduled_job',
  {
    name: varchar('name', { length: 64 }).primaryKey(),
    slotDate: date('slot_date', { mode: 'string' }).notNull(),
    status: varchar('status', { length: 16, enum: JOB_STATUSES }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** 성공이면 결과 요약, 실패면 오류. */
    result: text('result'),
  },
  (t) => [check('scheduled_job_status_check', sql`${t.status} IN (${inList(JOB_STATUSES)})`)],
);

export type ScheduledJobRun = typeof scheduledJob.$inferSelect;
