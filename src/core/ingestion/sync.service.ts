import { inspect } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Clock } from '../clock/clock.js';
import { SourceDocumentRepository } from '../memory/source-document.repository.js';
import { DocumentSource } from './document-source.js';

export interface SyncReport {
  /** 수집 범위 안의 문서 수. */
  readonly listed: number;
  readonly created: number;
  readonly changed: number;
  /** 원천 수정 시각은 바뀌었지만 본문은 같은 문서. */
  readonly unchanged: number;
  /** 원천 수정 시각이 같아 본문을 읽지 않은 문서. */
  readonly skipped: number;
  /** 원천에서 사라졌거나 범위를 벗어나 지운 문서. */
  readonly deleted: number;
  readonly addedChunks: number;
  readonly removedChunks: number;
  /** 본문을 읽거나 저장하지 못한 문서. 원천 수정 시각을 고치지 않으므로 다음 동기화가 다시 읽는다. */
  readonly failed: readonly { readonly title: string; readonly error: string }[];
}

/**
 * 원천 문서를 DB로 옮긴다 (설계 문서 7.1). 처음에는 전체를 백필하고, 그 뒤에는 원천 수정 시각이 바뀐 문서만 다시 읽는다.
 * 문서마다 실패를 따로 처리한다. 경험 카드 추출은 PENDING 문서를 대상으로 따로 한다.
 */
@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly documentSource: DocumentSource,
    private readonly repository: SourceDocumentRepository,
    private readonly clock: Clock,
  ) {}

  async run(): Promise<SyncReport> {
    const { source } = this.documentSource;
    const refs = await this.documentSource.list();
    const known = await this.repository.updatedAtByExternalId(source);
    // 공유를 실수로 끊었거나 루트 ID가 틀렸을 때 모아 둔 문서를 한꺼번에 지우지 않는다.
    if (refs.length === 0 && known.size > 0) {
      throw new Error(
        `수집 범위에 문서가 하나도 없다(저장된 문서 ${known.size}개). Notion 공유와 NOTION_ROOT_IDS를 확인한다`,
      );
    }
    const report = { created: 0, changed: 0, unchanged: 0, skipped: 0, addedChunks: 0, removedChunks: 0 };
    const failed: { title: string; error: string }[] = [];

    for (const ref of refs) {
      if (known.get(ref.externalId)?.getTime() === ref.updatedAt.getTime()) {
        report.skipped += 1;
        continue;
      }
      try {
        const chunks = await this.documentSource.fetchChunks(ref);
        const result = await this.repository.save(source, { ...ref, chunks }, this.clock.now());
        report[result.kind] += 1;
        if (result.kind === 'created') report.addedChunks += result.chunks;
        if (result.kind === 'changed') {
          report.addedChunks += result.added;
          report.removedChunks += result.removed;
        }
      } catch (e) {
        this.logger.warn(`문서 동기화 실패: ${ref.title} (${ref.externalId}) ${inspect(e)}`);
        failed.push({ title: ref.title, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // 목록을 끝까지 받았을 때만 여기까지 온다. 목록 조회가 실패하면 위에서 이미 예외가 났다.
    const deleted = await this.repository.deleteExcept(
      source,
      refs.map((r) => r.externalId),
    );
    await this.repository.markSynced(source, this.clock.now());
    return { listed: refs.length, ...report, deleted, failed };
  }
}
