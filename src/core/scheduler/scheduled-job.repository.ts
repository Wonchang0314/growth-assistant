import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { type JobStatus, scheduledJob, type ScheduledJobRun } from './scheduled-job.schema.js';

@Injectable()
export class ScheduledJobRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(name: string): Promise<ScheduledJobRun | undefined> {
    const [row] = await this.db.select().from(scheduledJob).where(eq(scheduledJob.name, name));
    return row;
  }

  /** 지난 실행을 덮어쓴다. */
  async start(name: string, slotDate: string, at: Date): Promise<void> {
    const row = { slotDate, status: 'RUNNING' as const, startedAt: at, finishedAt: null, result: null };
    await this.db
      .insert(scheduledJob)
      .values({ name, ...row })
      .onConflictDoUpdate({ target: scheduledJob.name, set: row });
  }

  async finish(name: string, status: Exclude<JobStatus, 'RUNNING'>, result: string, at: Date): Promise<void> {
    await this.db.update(scheduledJob).set({ status, result, finishedAt: at }).where(eq(scheduledJob.name, name));
  }
}
