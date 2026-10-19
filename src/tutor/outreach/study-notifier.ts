import { Logger } from '@nestjs/common';
import { publishNtfy } from '../../core/logging/ntfy.js';

/** 학습 알림을 누르면 여는 주소. 휴대폰에서 Claude 앱의 새 대화로 열리길 기대한다(iOS는 사용자가 확인, `docs/ops.md`). */
const OPEN_CLAUDE = 'https://claude.ai/new';

/** 휴대폰 학습 알림 하나. ntfy 서버를 평문으로 지나가므로 개수 정도만 싣고 개념 이름·문제 본문은 싣지 않는다. */
export interface StudyAlert {
  readonly title: string;
  readonly body: string;
}

/**
 * 학습 알림 포트 (ADR-0036). 운영 알림과 같은 ntfy 토픽을 쓰지만 종류가 다르고(우선순위 보통, 책 태그) 1시간 묶기를 하지 않는다.
 * 보내지 못하면 던진다. 예약 작업이 실패로 기록하고 운영 알림을 남긴다.
 */
export abstract class StudyNotifier {
  abstract notify(alert: StudyAlert): Promise<void>;
}

/** 로그로만 남긴다. `NTFY_TOPIC`이 없을 때 쓴다. */
export class LoggingStudyNotifier extends StudyNotifier {
  private readonly logger = new Logger('StudyNotifier');

  notify(alert: StudyAlert): Promise<void> {
    this.logger.log(`[학습 알림] ${alert.title}: ${alert.body}`);
    return Promise.resolve();
  }
}

export class NtfyStudyNotifier extends LoggingStudyNotifier {
  constructor(private readonly topicUrl: URL) {
    super();
  }

  override async notify(alert: StudyAlert): Promise<void> {
    await super.notify(alert);
    await publishNtfy(this.topicUrl, { ...alert, priority: 'default', tags: 'books', click: OPEN_CLAUDE });
  }
}
