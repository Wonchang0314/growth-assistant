import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../clock/clock.js';
import type { Env } from '../config/env.js';
import { AdminNotifier, LoggingAdminNotifier } from './admin-notifier.js';
import { NtfyAdminNotifier } from './ntfy-admin-notifier.js';
import { ntfyTopicUrl } from './ntfy.js';

/** 운영 알림 포트를 쓰는 모듈이 import한다. 앱마다 인스턴스가 하나라 묶기 상태도 하나다. `NTFY_TOPIC`이 없으면 로그만 남긴다. */
@Module({
  providers: [
    {
      provide: AdminNotifier,
      inject: [ConfigService, Clock],
      useFactory: (config: ConfigService<Env, true>, clock: Clock) => {
        const topicUrl = ntfyTopicUrl(config);
        return topicUrl ? new NtfyAdminNotifier(topicUrl, clock) : new LoggingAdminNotifier();
      },
    },
  ],
  exports: [AdminNotifier],
})
export class AdminNotifierModule {}
