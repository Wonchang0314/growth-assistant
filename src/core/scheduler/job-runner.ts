import { inspect } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Clock, localDate } from '../clock/clock.js';
import { AdminNotifier } from '../logging/admin-notifier.js';
import { type DailyJob, isDue, SCHEDULE_TIME_ZONE } from './daily-job.js';
import { JobLock } from './job-lock.js';
import { ScheduledJobRepository } from './scheduled-job.repository.js';

/** [JobRunner.runIfDue]가 한 일. */
export type JobOutcome = 'RAN' | 'NOT_DUE' | 'LOCKED';

/**
 * 예약 작업 하나를 돌린다: 잠금 → 오늘 몫을 이미 돌렸는지 확인 → 실행 기록 → 실패면 운영 알림.
 * 크론 시각과 서버 시작(놓친 실행 따라잡기)이 모두 이것을 부르므로, 어느 쪽이 먼저든 하루에 한 번만 돈다.
 */
@Injectable()
export class JobRunner {
  private readonly logger = new Logger(JobRunner.name);

  constructor(
    private readonly lock: JobLock,
    private readonly repository: ScheduledJobRepository,
    private readonly notifier: AdminNotifier,
    private readonly clock: Clock,
  ) {}

  async runIfDue(job: DailyJob): Promise<JobOutcome> {
    const release = await this.lock.tryAcquire(job.lock ?? job.name);
    if (!release) {
      this.logger.warn(`${job.name}: 같은 잠금(${job.lock ?? job.name})을 쓰는 일이 돌고 있어 건너뛴다`);
      return 'LOCKED';
    }
    try {
      // 잠금을 잡은 뒤에 본다. 앞선 실행이 방금 끝났어도 다시 돌지 않는다.
      const now = this.clock.now();
      if (!isDue(job.at, (await this.repository.find(job.name))?.slotDate, now, SCHEDULE_TIME_ZONE)) return 'NOT_DUE';
      await this.repository.start(job.name, localDate(now, SCHEDULE_TIME_ZONE), now);
      this.logger.log(`${job.name} 시작`);
      try {
        const summary = await job.run();
        await this.repository.finish(job.name, 'SUCCEEDED', summary, this.clock.now());
        this.logger.log(`${job.name} 끝: ${summary}`);
      } catch (e) {
        await this.repository.finish(job.name, 'FAILED', e instanceof Error ? e.message : String(e), this.clock.now());
        await this.notifier.notify('SCHEDULED_JOB_FAILED', `${job.name}: ${inspect(e)}`);
      }
      return 'RAN';
    } finally {
      await release();
    }
  }
}
