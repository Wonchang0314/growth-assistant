import { DocumentSource, type DocumentRef } from '../../src/core/ingestion/document-source.js';
import type { FetchedDocument } from '../../src/core/memory/source-document.js';

/** 메모리에 둔 문서를 돌려주는 원천. [failing]에 넣은 문서는 본문을 읽을 때 실패한다. */
export class FakeDocumentSource extends DocumentSource {
  readonly source = 'NOTION';
  documents: FetchedDocument[] = [];
  readonly failing = new Set<string>();
  readonly fetched: string[] = [];

  list(): Promise<DocumentRef[]> {
    return Promise.resolve(
      this.documents.map((d) => ({ externalId: d.externalId, title: d.title, url: d.url, updatedAt: d.updatedAt })),
    );
  }

  fetchChunks(ref: DocumentRef): Promise<string[]> {
    this.fetched.push(ref.externalId);
    const doc = this.documents.find((d) => d.externalId === ref.externalId);
    if (this.failing.has(ref.externalId) || !doc) return Promise.reject(new Error(`읽기 실패: ${ref.externalId}`));
    return Promise.resolve([...doc.chunks]);
  }
}
