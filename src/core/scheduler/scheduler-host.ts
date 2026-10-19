import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { waitForDb } from '../db/wait-for-db.js';
import { cronOf, isDailyJob, SCHEDULE_TIME_ZONE, ScheduledJob } from './daily-job.js';
import { JobRunner } from './job-runner.js';

/**
 * `@ScheduledJob()` 작업을 모아 크론에 걸고, 서버가 뜰 때 오늘 놓친 몫을 한 번씩 따라잡는다.
 * 같은 이벤트 루프에서 돌므로 작업은 기다리지 않고 뒤에서 돌린다(서버는 바로 요청을 받는다).
 */
@Injectable()
export class SchedulerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerHost.name);
  private readonly catchingUp: Promise<unknown>[] = [];

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly registry: SchedulerRegistry,
    private readonly runner: JobRunner,
    @Inject(DB) private readonly db: Db,
  ) {}

  /** DB가 끝내 닿지 않으면 던져서 서버가 뜨지 않게 한다(launchd가 다시 띄운다). */
  async onApplicationBootstrap(): Promise<void> {
    await waitForDb(() => this.db.execute(sql`SELECT 1`));
    const jobs = this.discovery
      .getProviders({ metadataKey: ScheduledJob.KEY })
      .map((wrapper): unknown => wrapper.instance)
      .filter(isDailyJob);
    for (const job of jobs) {
      const run = () =>
        this.runner.runIfDue(job).catch((e: unknown) => {
          this.logger.error(`${job.name} 실행 실패`, e);
        });
      this.registry.addCronJob(
        job.name,
        CronJob.from({
          cronTime: cronOf(job.at),
          timeZone: SCHEDULE_TIME_ZONE,
          onTick: () => {
            void run();
          },
          start: true,
        }),
      );
      this.catchingUp.push(run());
    }
    this.logger.log(`예약 작업: ${jobs.map((j) => `${j.name} ${j.at}`).join(', ')}`);
  }

  /** 시작할 때 시작한 따라잡기가 모두 끝날 때까지 기다린다. 테스트에서 쓴다. */
  async idle(): Promise<void> {
    await Promise.all(this.catchingUp);
  }
}
