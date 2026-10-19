import { Logger } from '@nestjs/common';
import type { NtfyMessage } from './ntfy.js';

/**
 * 운영 알림 종류와 휴대폰 알림 제목·우선순위. 같은 종류는 1시간에 한 번만 보낸다(alert-throttle.ts).
 * 탈취가 의심되는 리프레시 토큰 재사용만 `urgent`(방해 금지에서도 울림)이고 나머지는 `high`다.
 */
export const ADMIN_ALERTS = {
  REFRESH_TOKEN_REUSE: { title: '리프레시 토큰 재사용으로 연결을 폐기했다', priority: 'urgent' },
  LOGIN_REJECTED: { title: '허용되지 않은 계정이 로그인을 시도했다', priority: 'high' },
  CLAUDE_CLI_AUTH: { title: 'Claude CLI 인증 오류', priority: 'high' },
  SCHEDULED_JOB_FAILED: { title: '예약 작업이 실패했다', priority: 'high' },
} as const satisfies Record<string, Pick<NtfyMessage, 'title' | 'priority'>>;
export type AdminAlertKind = keyof typeof ADMIN_ALERTS;

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
