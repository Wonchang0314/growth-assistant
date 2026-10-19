import { Injectable, Logger } from '@nestjs/common';
import { runStage, type StageResult, stagesText } from '../scheduler/daily-job.js';
import { JobLock } from '../scheduler/job-lock.js';
import { ExtractionService } from './extraction.service.js';
import { SyncService } from './sync.service.js';

/** 수집(동기화·추출)을 하는 일이 함께 거는 잠금. 새벽 작업과 `sync_now`가 겹치지 않는다. */
export const INGESTION_LOCK = 'ingestion';

/** 추출이 사용량 한도나 로그인 문제로 멈췄으면 단계를 실패로 둔다. 문서 하나의 실패는 다음 실행이 다시 하므로 요약에만 남긴다. */
function stopped(summary: string, reason: string | null): string {
  if (reason !== null) throw new Error(`${summary}, 중간에 멈춤: ${reason}`);
  return summary;
}

/**
 * 동기화 → 경험 카드 추출. `npm run sync`·`extract`가 쓰는 서비스를 차례로 부른다.
 * 앞 단계가 실패해도 뒤 단계는 한다. 추출은 PENDING·FAILED 문서를 대상으로 하므로 이번에 바뀐 것과 지난번에 남은 것을 함께 처리한다.
 * 판단 사례 추상화는 문제에 쓰지 않게 돼 넣지 않는다. 손으로는 `npm run abstract`로 돌린다 (ADR-0038).
 */
@Injectable()
export class IngestionPipeline {
  private readonly logger = new Logger(IngestionPipeline.name);
  private running: Promise<void> | undefined;

  constructor(
    private readonly sync: SyncService,
    private readonly extraction: ExtractionService,
    private readonly lock: JobLock,
  ) {}

  /** 잠금은 부르는 쪽이 잡는다. */
  async run(): Promise<StageResult[]> {
    return [
      await runStage('동기화', async () => {
        const r = await this.sync.run();
        return `문서 ${r.listed}개 (새로 ${r.created}, 바뀜 ${r.changed}, 지움 ${r.deleted}, 실패 ${r.failed.length})`;
      }),
      await runStage('추출', async () => {
        const r = await this.extraction.run({});
        return stopped(`문서 ${r.done}개, 카드 ${r.cards}장, 실패 ${r.failed.length}`, r.stopped);
      }),
    ];
  }

  /**
   * 잠금을 잡고 동기화 → 추출을 뒤에서 시작한다(`sync_now`). 이미 누가 돌고 있으면 시작하지 않고 false다.
   * 결과는 로그에 남고, 사용자는 `sync_status`로 본다.
   */
  async startInBackground(): Promise<boolean> {
    const release = await this.lock.tryAcquire(INGESTION_LOCK);
    if (!release) return false;
    this.running = this.run()
      .then((results) => {
        this.logger.log(`바로 동기화 끝: ${stagesText(results)}`);
      })
      .finally(release)
      .catch((e: unknown) => {
        this.logger.error('바로 동기화 실패', e);
      });
    return true;
  }

  /** 뒤에서 도는 동기화가 끝날 때까지 기다린다. 테스트에서 쓴다. */
  async idle(): Promise<void> {
    await this.running;
  }
}
