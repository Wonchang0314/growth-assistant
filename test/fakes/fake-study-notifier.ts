import { type StudyAlert, StudyNotifier } from '../../src/tutor/outreach/study-notifier.js';

/** 받은 학습 알림을 모은다. `.env`의 `NTFY_TOPIC`으로 실제 휴대폰에 보내지 않게 테스트는 늘 이것을 쓴다. */
export class FakeStudyNotifier extends StudyNotifier {
  readonly alerts: StudyAlert[] = [];

  notify(alert: StudyAlert): Promise<void> {
    this.alerts.push(alert);
    return Promise.resolve();
  }
}
