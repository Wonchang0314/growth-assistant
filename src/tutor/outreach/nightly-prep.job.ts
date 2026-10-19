import { Injectable } from '@nestjs/common';
import { IngestionPipeline, INGESTION_LOCK } from '../../core/ingestion/ingestion-pipeline.js';
import { type DailyJob, runStage, ScheduledJob, stagesText } from '../../core/scheduler/daily-job.js';
import { QuizReviewService } from '../quiz/application/quiz-review.service.js';

/** 하룻밤에 문제를 미리 만드는 개념 수의 상한. 개념마다 출제·검증으로 `claude -p`를 두세 번 부른다. */
export const NIGHTLY_PREPARE_LIMIT = 10;

/**
 * 04:00 새벽 작업 (ADR-0036): Notion 동기화 → 경험 카드 추출 → 오늘 복습할 개념 중 낼 문제가 없는 개념의 문제 미리 만들기.
 * 판단 사례 추상화는 문제에 쓰지 않게 돼 하지 않는다(ADR-0038). 앞 단계가 실패해도 뒤 단계는 하고, 하나라도 실패하면 끝에 던져
 * 실패로 기록·알린다. `sync_now`와 같은 잠금을 써서 겹치지 않는다.
 */
@ScheduledJob()
@Injectable()
export class NightlyPrepJob implements DailyJob {
  readonly name = 'nightly-prep';
  readonly at = '04:00';
  readonly lock = INGESTION_LOCK;

  constructor(
    private readonly pipeline: IngestionPipeline,
    private readonly review: QuizReviewService,
  ) {}

  async run(): Promise<string> {
    const results = [
      ...(await this.pipeline.run()),
      await runStage('문제 만들기', async () => {
        const r = await this.review.prepareToday(NIGHTLY_PREPARE_LIMIT);
        return `문제가 없는 개념 ${r.concepts}개 중 ${r.ready}개 만듦`;
      }),
    ];
    const text = stagesText(results);
    if (results.some((r) => !r.ok)) throw new Error(text);
    return text;
  }
}
