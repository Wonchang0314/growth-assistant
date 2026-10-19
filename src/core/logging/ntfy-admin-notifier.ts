import type { Clock } from '../clock/clock.js';
import { ADMIN_ALERTS, type AdminAlertKind, LoggingAdminNotifier } from './admin-notifier.js';
import { AlertThrottle } from './alert-throttle.js';
import { publishNtfy } from './ntfy.js';

/**
 * 로그에 남기고 ntfy 토픽으로 휴대폰에 보낸다(같은 종류는 1시간에 한 번). 메시지는 ntfy 서버를 평문으로 지나가므로
 * 종류·건수·시각만 보내고 [detail](이메일, 토큰 계열 ID 등)은 로그에만 남긴다. 전송 실패는 로그만 남긴다.
 */
export class NtfyAdminNotifier extends LoggingAdminNotifier {
  private readonly throttle = new AlertThrottle();

  /** [topicUrl]은 `<NTFY_URL>/<NTFY_TOPIC>`(ntfy.ts `ntfyTopicUrl`). */
  constructor(
    private readonly topicUrl: URL,
    private readonly clock: Clock,
  ) {
    super();
  }

  override async notify(kind: AdminAlertKind, detail: string): Promise<void> {
    await super.notify(kind, detail);
    const now = this.clock.now();
    const held = this.throttle.admit(kind, now);
    if (held === null) return;
    const time = now.toLocaleString('sv-SE', { timeZone: this.clock.timeZone });
    try {
      await publishNtfy(this.topicUrl, {
        ...ADMIN_ALERTS[kind],
        tags: 'warning',
        body: `${time}${held > 0 ? ` 외 ${held}건` : ''}. 자세한 내용은 서버 로그를 본다.`,
      });
    } catch (e) {
      this.logger.warn(`ntfy 전송 실패 (${kind}): ${String(e)}`);
    }
  }
}
