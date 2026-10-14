import { Injectable, Logger } from '@nestjs/common';

/** `#관리` 채널 알림 포트 (인증 만료, 수집 실패 등). 유스케이스는 이 추상 클래스에만 의존한다. */
export abstract class AdminNotifier {
  abstract notify(message: string): Promise<void>;
}

/** Discord를 끈 실행(테스트 등)에서는 로그로만 남긴다. */
@Injectable()
export class LoggingAdminNotifier extends AdminNotifier {
  private readonly logger = new Logger('AdminNotifier');

  notify(message: string): Promise<void> {
    this.logger.warn(`[관리 알림] ${message}`);
    return Promise.resolve();
  }
}
