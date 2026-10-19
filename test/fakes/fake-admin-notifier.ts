import { AdminNotifier, type AdminAlertKind } from '../../src/core/logging/admin-notifier.js';

/** 받은 운영 알림을 모은다. 테스트가 `.env`의 `NTFY_TOPIC`으로 실제 휴대폰에 알리지 않게 앱 테스트는 늘 이것으로 바꾼다. */
export class FakeAdminNotifier extends AdminNotifier {
  readonly alerts: { kind: AdminAlertKind; detail: string }[] = [];

  notify(kind: AdminAlertKind, detail: string): Promise<void> {
    this.alerts.push({ kind, detail });
    return Promise.resolve();
  }
}
