import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../clock/clock.js';
import type { Env } from '../config/env.js';
import { AdminNotifier, LoggingAdminNotifier } from './admin-notifier.js';
import { NtfyAdminNotifier } from './ntfy-admin-notifier.js';

/** 운영 알림 포트를 쓰는 모듈이 import한다. 앱마다 인스턴스가 하나라 묶기 상태도 하나다. `NTFY_TOPIC`이 없으면 로그만 남긴다. */
@Module({
  providers: [
    {
      provide: AdminNotifier,
      inject: [ConfigService, Clock],
      useFactory: (config: ConfigService<Env, true>, clock: Clock) => {
        const topic = config.get('NTFY_TOPIC', { infer: true });
        if (!topic) return new LoggingAdminNotifier();
        return new NtfyAdminNotifier(
          new URL(`${config.get('NTFY_URL', { infer: true })}/${encodeURIComponent(topic)}`),
          clock,
        );
      },
    },
  ],
  exports: [AdminNotifier],
})
export class AdminNotifierModule {}
