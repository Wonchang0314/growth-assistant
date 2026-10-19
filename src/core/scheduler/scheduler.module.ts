import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AdminNotifierModule } from '../logging/admin-notifier.module.js';
import { JobLock } from './job-lock.js';
import { JobRunner } from './job-runner.js';
import { ScheduledJobRepository } from './scheduled-job.repository.js';
import { SchedulerHost } from './scheduler-host.js';

/** 예약 작업 실행(잠금, 실행 기록, 실패 알림). 잠금을 함께 쓰는 모듈(`sync_now`)과 작업을 두는 모듈이 import한다. */
@Module({
  imports: [AdminNotifierModule],
  providers: [JobLock, JobRunner, ScheduledJobRepository],
  exports: [JobLock, JobRunner],
})
export class SchedulerModule {}

/**
 * 스케줄러를 켠다(ADR-0036). 상시 실행 HTTP 진입점의 루트 모듈만 import한다. stdio 서버·CLI·테스트 앱에는 없어서
 * `@ScheduledJob()` 작업이 provider로 있어도 돌지 않는다.
 */
@Module({
  imports: [ScheduleModule.forRoot(), DiscoveryModule, SchedulerModule],
  providers: [SchedulerHost],
})
export class SchedulerHostModule {}
