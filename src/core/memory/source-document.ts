import { createHash } from 'node:crypto';

/** 기억의 원천 (ADR-0023). */
export const SOURCES = ['NOTION'] as const;
export type Source = (typeof SOURCES)[number];

/** 원문에서 경험 카드를 뽑았는지. 내용이 바뀌면 PENDING으로 돌아간다 (설계 문서 7.1). */
export const EXTRACTION_STATUSES = ['PENDING', 'DONE', 'FAILED'] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

/** 원천에서 읽어 온 문서 하나. [chunks]는 순서대로 나눈 본문이다 (Notion은 최상위 블록 하나가 청크 하나). */
export interface FetchedDocument {
  readonly externalId: string;
  readonly title: string;
  readonly url: string;
  readonly updatedAt: Date;
  readonly chunks: readonly string[];
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** 청크 해시 목록으로 문서 전체의 해시를 만든다. 순서가 바뀌어도 내용이 바뀐 것으로 본다. */
export function contentHashOf(chunkHashes: readonly string[]): string {
  return sha256(chunkHashes.join('\n'));
}

/** 바뀐 청크 수. 같은 내용의 청크는 위치가 달라도 남은 것으로 센다. */
export function diffChunks(before: readonly string[], after: readonly string[]): { added: number; removed: number } {
  const remaining = new Map<string, number>();
  for (const h of before) remaining.set(h, (remaining.get(h) ?? 0) + 1);
  let added = 0;
  for (const h of after) {
    const left = remaining.get(h) ?? 0;
    if (left === 0) added += 1;
    else remaining.set(h, left - 1);
  }
  const removed = [...remaining.values()].reduce((sum, n) => sum + n, 0);
  return { added, removed };
}
