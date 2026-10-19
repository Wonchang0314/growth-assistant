import { Global, Injectable, Module } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeAdminNotifier } from '../../../test/fakes/fake-admin-notifier.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { Clock } from '../clock/clock.js';
import { ClockModule } from '../clock/clock.module.js';
import { DB, DB_POOL } from '../db/db.module.js';
import { AdminNotifier } from '../logging/admin-notifier.js';
import { type DailyJob, ScheduledJob } from './daily-job.js';
import { JobLock } from './job-lock.js';
import { JobRunner } from './job-runner.js';
import { ScheduledJobRepository } from './scheduled-job.repository.js';
import { SchedulerHost } from './scheduler-host.js';
import { SchedulerHostModule } from './scheduler.module.js';

const testDb = connectTestDb();
const pool = new Pool(inject('database'));
const repository = new ScheduledJobRepository(testDb.db);
const lock = new JobLock(pool);
let clock: FixedClock;
let notifier: FakeAdminNotifier;
let runner: JobRunner;

/** 04:00에 도는 작업. [gate]가 있으면 그 약속이 풀릴 때까지 끝나지 않고, [error]가 있으면 실패한다. */
class TestJob implements DailyJob {
  readonly name = 'test-job';
  readonly at = '04:00';
  runs = 0;
  gate: Promise<void> | undefined;
  error: Error | undefined;
  lock: string | undefined;

  async run(): Promise<string> {
    this.runs += 1;
    await this.gate;
    if (this.error) throw this.error;
    return '끝';
  }
}

beforeEach(async () => {
  await testDb.truncateAll();
  clock = new FixedClock(new Date('2026-10-20T09:00:00+09:00'));
  notifier = new FakeAdminNotifier();
  runner = new JobRunner(lock, repository, notifier, clock);
});
afterAll(async () => {
  await pool.end();
  await testDb.close();
});

describe('JobLock', () => {
  // hashtext가 음수인 키와 양수인 키가 섞이게 여럿을 본다.
  it.each(['ingestion', 'test-job', 'morning-alert', 'evening-alert', 'a', 'b'])(
    '%s: 잡은 동안에만 잡혀 있다고 보이고, 다른 연결은 잡지 못한다',
    async (key) => {
      expect(await lock.isHeld(key)).toBe(false);
      const release = await lock.tryAcquire(key);

      expect(await lock.isHeld(key)).toBe(true);
      expect(await lock.tryAcquire(key)).toBeNull();
      await release?.();
      expect(await lock.isHeld(key)).toBe(false);
    },
  );
});

describe('JobRunner', () => {
  it('오늘 시각이 지났으면 한 번 돌고 기록을 남기며, 같은 날 다시 불러도 돌지 않는다', async () => {
    const job = new TestJob();

    expect(await runner.runIfDue(job)).toBe('RAN');
    clock.advance(60_000);
    expect(await runner.runIfDue(job)).toBe('NOT_DUE');

    expect(job.runs).toBe(1);
    expect(await repository.find(job.name)).toMatchObject({
      slotDate: '2026-10-20',
      status: 'SUCCEEDED',
      result: '끝',
      startedAt: new Date('2026-10-20T09:00:00+09:00'),
    });
  });

  it('다음 날에는 시각이 지난 뒤에 다시 돈다', async () => {
    const job = new TestJob();
    await runner.runIfDue(job);

    clock.advance(18 * 3_600_000); // 다음 날 03:00
    expect(await runner.runIfDue(job)).toBe('NOT_DUE');
    clock.advance(3_600_000); // 다음 날 04:00
    expect(await runner.runIfDue(job)).toBe('RAN');
    expect(job.runs).toBe(2);
  });

  it('도는 동안 같은 작업을 다시 부르면 겹쳐 돌지 않는다', async () => {
    const job = new TestJob();
    const gate = Promise.withResolvers<undefined>();
    job.gate = gate.promise;

    const first = runner.runIfDue(job);
    await expect.poll(() => job.runs).toBe(1);
    const second = await runner.runIfDue(job);
    gate.resolve(undefined);

    expect(second).toBe('LOCKED');
    expect(await first).toBe('RAN');
    expect(job.runs).toBe(1);
  });

  it('같은 잠금을 다른 일이 잡고 있으면 건너뛰고, 기록하지 않아 나중에 다시 돌 수 있다', async () => {
    const job = new TestJob();
    job.lock = 'ingestion';
    const release = await lock.tryAcquire('ingestion');

    expect(await runner.runIfDue(job)).toBe('LOCKED');
    await release?.();
    expect(await runner.runIfDue(job)).toBe('RAN');
  });

  it('실패하면 기록하고 운영 알림을 보내며, 같은 날 다시 돌리지 않는다', async () => {
    const job = new TestJob();
    job.error = new Error('동기화 실패: Notion 응답 없음');

    await runner.runIfDue(job);

    expect(await repository.find(job.name)).toMatchObject({
      status: 'FAILED',
      result: '동기화 실패: Notion 응답 없음',
    });
    expect(notifier.alerts.map((a) => a.kind)).toEqual(['SCHEDULED_JOB_FAILED']);
    expect(await runner.runIfDue(job)).toBe('NOT_DUE');
  });
});

@ScheduledJob()
@Injectable()
class BootJob extends TestJob {}

@Global()
@Module({
  providers: [
    { provide: DB, useValue: testDb.db },
    { provide: DB_POOL, useValue: pool },
  ],
  exports: [DB, DB_POOL],
})
class TestDbModule {}

/** 스케줄러를 켠 앱을 띄웠다가(서버 시작) 닫는다. */
async function boot() {
  const app = await Test.createTestingModule({
    imports: [TestDbModule, ClockModule, SchedulerHostModule],
    providers: [BootJob],
  })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(AdminNotifier)
    .useValue(notifier)
    .compile();
  await app.init();
  await app.get(SchedulerHost).idle();
  const job = app.get(BootJob);
  const cron = app.get(SchedulerRegistry).getCronJob(job.name);
  await app.close();
  return { runs: job.runs, cron };
}

describe('SchedulerHost', () => {
  it('서버가 뜰 때 오늘 놓친 작업을 한 번만 따라잡고 크론에 건다', async () => {
    const first = await boot();
    const second = await boot();

    expect(first.runs).toBe(1);
    expect(second.runs).toBe(0);
    expect(first.cron.cronTime.source).toBe('0 0 4 * * *');
  });

  it('오늘 몫이 도중에 끊겨 RUNNING으로 남았으면 서버가 뜰 때 다시 돌린다', async () => {
    await repository.start('test-job', '2026-10-20', new Date('2026-10-20T04:00:00+09:00'));

    expect((await boot()).runs).toBe(1);
    expect(await repository.find('test-job')).toMatchObject({ status: 'SUCCEEDED' });
  });

  it('오늘 시각 전에 뜨면 따라잡지 않는다', async () => {
    clock = new FixedClock(new Date('2026-10-20T03:00:00+09:00'));

    expect((await boot()).runs).toBe(0);
  });
});
