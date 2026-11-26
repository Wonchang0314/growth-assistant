import { Injectable } from '@nestjs/common';
import { type DailyJob, ScheduledJob } from '../../core/scheduler/daily-job.js';
import { QuizReviewService } from '../quiz/application/quiz-review.service.js';

/**
 * 04:00 새벽 작업 (ADR-0036): 오늘 계획(20개 개념, ADR-0040)을 정하고 지금 각도로 낼 문제가 없는 개념의 문제 미리 만들기.
 * 개념마다 출제·검증으로 `claude -p`를 두세 번 부른다. Notion 동기화·추출은 수집을 꺼 두어 하지 않는다(ADR-0042).
 * 잠금은 작업 이름이라 서버가 둘 떠도 겹쳐 돌지 않는다.
 */
@ScheduledJob()
@Injectable()
export class NightlyPrepJob implements DailyJob {
  readonly name = 'nightly-prep';
  readonly at = '04:00';

  constructor(private readonly review: QuizReviewService) {}

  async run(): Promise<string> {
    const r = await this.review.prepareToday();
    return `문제 만들기: 문제가 없는 개념 ${r.concepts}개 중 ${r.ready}개 만듦`;
  }
}
