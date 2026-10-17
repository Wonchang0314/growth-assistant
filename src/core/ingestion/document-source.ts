import type { FetchedDocument, Source } from '../memory/source-document.js';

/** 수집 범위 안에 있는 문서. 본문은 아직 읽지 않았다. */
export type DocumentRef = Omit<FetchedDocument, 'chunks'>;

/** 기억의 원천 포트 (설계 문서 7.1). 원천마다 어댑터를 하나 둔다 (지금은 Notion만, ADR-0023). */
export abstract class DocumentSource {
  abstract readonly source: Source;
  /** 수집 범위 안의 문서 전체. 여기 없는 문서는 동기화가 지운다. */
  abstract list(): Promise<DocumentRef[]>;
  /** 문서 본문을 청크로 나눠 읽는다. */
  abstract fetchChunks(ref: DocumentRef): Promise<string[]>;
}
