import { Injectable, Logger } from '@nestjs/common';
import { runStage, type StageResult, stagesText } from '../scheduler/daily-job.js';
import { JobLock } from '../scheduler/job-lock.js';
import { CaseAbstractionService } from './case-abstraction.service.js';
import { ExtractionService } from './extraction.service.js';
import { SyncService } from './sync.service.js';

/** 수집(동기화·추출·추상화)을 하는 일이 함께 거는 잠금. 새벽 작업과 `sync_now`가 겹치지 않는다. */
export const INGESTION_LOCK = 'ingestion';

/** 추출·추상화가 사용량 한도나 로그인 문제로 멈췄으면 단계를 실패로 둔다. 문서·카드 하나의 실패는 다음 실행이 다시 하므로 요약에만 남긴다. */
function stopped(summary: string, reason: string | null): string {
  if (reason !== null) throw new Error(`${summary}, 중간에 멈춤: ${reason}`);
  return summary;
}

/**
 * 동기화 → 경험 카드 추출 (→ 판단 사례 추상화). `npm run sync`·`extract`·`abstract`가 쓰는 서비스를 차례로 부른다.
 * 앞 단계가 실패해도 뒤 단계는 한다. 추출은 PENDING·FAILED 문서를, 추상화는 아직 선별하지 않은 카드를 대상으로 하므로
 * 이번에 바뀐 것과 지난번에 남은 것을 함께 처리한다.
 */
@Injectable()
export class IngestionPipeline {
  private readonly logger = new Logger(IngestionPipeline.name);
  private running: Promise<void> | undefined;

  constructor(
    private readonly sync: SyncService,
    private readonly extraction: ExtractionService,
    private readonly abstraction: CaseAbstractionService,
    private readonly lock: JobLock,
  ) {}

  /** 잠금은 부르는 쪽이 잡는다. */
  async run(options: { abstract: boolean }): Promise<StageResult[]> {
    const results = [
      await runStage('동기화', async () => {
        const r = await this.sync.run();
        return `문서 ${r.listed}개 (새로 ${r.created}, 바뀜 ${r.changed}, 지움 ${r.deleted}, 실패 ${r.failed.length})`;
      }),
      await runStage('추출', async () => {
        const r = await this.extraction.run({});
        return stopped(`문서 ${r.done}개, 카드 ${r.cards}장, 실패 ${r.failed.length}`, r.stopped);
      }),
    ];
    if (!options.abstract) return results;
    const abstraction = await runStage('판단 사례', async () => {
      const r = await this.abstraction.run({});
      return stopped(
        `선별 ${r.screened}장, 경험 ${r.experience}·가정 ${r.hypothetical}·PENDING ${r.pending}, 실패 ${r.failed.length}`,
        r.stopped,
      );
    });
    return [...results, abstraction];
  }

  /**
   * 잠금을 잡고 동기화 → 추출을 뒤에서 시작한다(`sync_now`). 이미 누가 돌고 있으면 시작하지 않고 false다.
   * 결과는 로그에 남고, 사용자는 `sync_status`로 본다.
   */
  async startInBackground(): Promise<boolean> {
    const release = await this.lock.tryAcquire(INGESTION_LOCK);
    if (!release) return false;
    this.running = this.run({ abstract: false })
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
