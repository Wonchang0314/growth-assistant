import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, notInArray } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { documentChunk, sourceDocument, syncCursor } from './source-document.schema.js';
import {
  contentHashOf,
  diffChunks,
  type ExtractionStatus,
  type FetchedDocument,
  sha256,
  type Source,
} from './source-document.js';

/** 문서 하나를 저장한 결과. */
export type SaveResult =
  | { readonly kind: 'created'; readonly chunks: number }
  | { readonly kind: 'changed'; readonly added: number; readonly removed: number }
  | { readonly kind: 'unchanged' };

export interface SourceStatus {
  readonly lastSyncedAt: Date | null;
  readonly documents: number;
  readonly chunks: number;
  readonly byExtractionStatus: Readonly<Partial<Record<ExtractionStatus, number>>>;
}

@Injectable()
export class SourceDocumentRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 원천 쪽 수정 시각. 동기화할 때 이 시각이 같은 문서는 본문을 다시 읽지 않는다. */
  async updatedAtByExternalId(source: Source): Promise<Map<string, Date>> {
    const rows = await this.db
      .select({ externalId: sourceDocument.externalId, updatedAt: sourceDocument.sourceUpdatedAt })
      .from(sourceDocument)
      .where(eq(sourceDocument.source, source));
    return new Map(rows.map((r) => [r.externalId, r.updatedAt]));
  }

  /**
   * 문서와 청크를 한 트랜잭션으로 저장한다. 본문이 그대로면 메타데이터(제목, 수정 시각)만 고친다.
   * 본문이 바뀌면 청크를 통째로 다시 쓰고 경험 카드를 다시 뽑도록 PENDING으로 돌린다.
   */
  async save(source: Source, doc: FetchedDocument, syncedAt: Date): Promise<SaveResult> {
    const chunks = doc.chunks.map((content, seq) => ({ seq, content, chunkHash: sha256(content) }));
    const hashes = chunks.map((c) => c.chunkHash);
    const contentHash = contentHashOf(hashes);
    const meta = { title: doc.title, url: doc.url, sourceUpdatedAt: doc.updatedAt, syncedAt };
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: sourceDocument.id, contentHash: sourceDocument.contentHash })
        .from(sourceDocument)
        .where(and(eq(sourceDocument.source, source), eq(sourceDocument.externalId, doc.externalId)));

      if (existing?.contentHash === contentHash) {
        await tx.update(sourceDocument).set(meta).where(eq(sourceDocument.id, existing.id));
        return { kind: 'unchanged' };
      }

      const writeChunks = async (documentId: number) => {
        if (chunks.length === 0) return;
        await tx.insert(documentChunk).values(chunks.map((c) => ({ documentId, ...c })));
      };

      if (!existing) {
        const [row] = await tx
          .insert(sourceDocument)
          .values({ source, externalId: doc.externalId, contentHash, ...meta })
          .returning({ id: sourceDocument.id });
        if (!row) throw new Error(`문서를 저장하지 못했다: ${doc.externalId}`);
        await writeChunks(row.id);
        return { kind: 'created', chunks: chunks.length };
      }

      const before = await tx
        .select({ hash: documentChunk.chunkHash })
        .from(documentChunk)
        .where(eq(documentChunk.documentId, existing.id))
        .orderBy(asc(documentChunk.seq));
      await tx.delete(documentChunk).where(eq(documentChunk.documentId, existing.id));
      await writeChunks(existing.id);
      await tx
        .update(sourceDocument)
        .set({ ...meta, contentHash, extractionStatus: 'PENDING', lastError: null })
        .where(eq(sourceDocument.id, existing.id));
      return {
        kind: 'changed',
        ...diffChunks(
          before.map((b) => b.hash),
          hashes,
        ),
      };
    });
  }

  /** 원천에서 사라졌거나 수집 범위를 벗어난 문서를 지운다 (청크도 함께). 지운 수를 돌려준다. */
  async deleteExcept(source: Source, keepExternalIds: readonly string[]): Promise<number> {
    const deleted = await this.db
      .delete(sourceDocument)
      .where(
        and(
          eq(sourceDocument.source, source),
          keepExternalIds.length > 0 ? notInArray(sourceDocument.externalId, [...keepExternalIds]) : undefined,
        ),
      )
      .returning({ id: sourceDocument.id });
    return deleted.length;
  }

  async markSynced(source: Source, at: Date): Promise<void> {
    await this.db
      .insert(syncCursor)
      .values({ source, lastSyncedAt: at })
      .onConflictDoUpdate({ target: syncCursor.source, set: { lastSyncedAt: at } });
  }

  async status(source: Source): Promise<SourceStatus> {
    const [cursor] = await this.db.select().from(syncCursor).where(eq(syncCursor.source, source));
    const byStatus = await this.db
      .select({ status: sourceDocument.extractionStatus, documents: count() })
      .from(sourceDocument)
      .where(eq(sourceDocument.source, source))
      .groupBy(sourceDocument.extractionStatus);
    const [chunks] = await this.db
      .select({ chunks: count() })
      .from(documentChunk)
      .innerJoin(sourceDocument, eq(documentChunk.documentId, sourceDocument.id))
      .where(eq(sourceDocument.source, source));
    return {
      lastSyncedAt: cursor?.lastSyncedAt ?? null,
      documents: byStatus.reduce((sum, r) => sum + r.documents, 0),
      chunks: chunks?.chunks ?? 0,
      byExtractionStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.documents])),
    };
  }
}
