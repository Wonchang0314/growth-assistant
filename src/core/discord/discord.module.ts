import { Module } from '@nestjs/common';
import { AdminNotifier, LoggingAdminNotifier } from './admin-notifier.js';

// Discord 게이트웨이를 옮기기 전까지는 관리 알림을 로그로 남긴다.
@Module({
  providers: [{ provide: AdminNotifier, useClass: LoggingAdminNotifier }],
  exports: [AdminNotifier],
})
export class DiscordModule {}
