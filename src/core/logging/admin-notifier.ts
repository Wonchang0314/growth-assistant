import { Logger } from '@nestjs/common';

/** 운영 알림 종류와 휴대폰 알림 제목. 같은 종류는 1시간에 한 번만 보낸다(alert-throttle.ts). */
export const ADMIN_ALERT_TITLES = {
  REFRESH_TOKEN_REUSE: '리프레시 토큰 재사용으로 연결을 폐기했다',
  LOGIN_REJECTED: '허용되지 않은 계정이 로그인을 시도했다',
  CLAUDE_CLI_AUTH: 'Claude CLI 인증 오류',
} as const;
export type AdminAlertKind = keyof typeof ADMIN_ALERT_TITLES;

/**
 * 운영 알림 포트. 유스케이스는 이 추상 클래스에만 의존한다. [detail]은 서버 로그에만 남고 바깥으로 보내지 않는다.
 * 알림 전송이 실패해도 예외를 던지지 않는다(부른 쪽의 요청 처리는 그대로 이어진다).
 */
export abstract class AdminNotifier {
  abstract notify(kind: AdminAlertKind, detail: string): Promise<void>;
}

/** 로그로만 남긴다. `NTFY_TOPIC`이 없을 때(stdio 서버, CLI, 테스트) 쓴다. */
export class LoggingAdminNotifier extends AdminNotifier {
  protected readonly logger = new Logger('AdminNotifier');

  notify(kind: AdminAlertKind, detail: string): Promise<void> {
    this.logger.warn(`[관리 알림] ${kind}: ${detail}`);
    return Promise.resolve();
  }
}
