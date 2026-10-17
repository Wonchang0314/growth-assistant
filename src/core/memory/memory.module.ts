import { Module } from '@nestjs/common';
import { SourceDocumentRepository } from './source-document.repository.js';

/** 원문 문서와 청크 (설계 문서 5.2). 경험 카드·판단 사례는 2단계 추출에서 더한다. 회사 용어는 지금 `npm run terms`만 쓴다. */
@Module({
  providers: [SourceDocumentRepository],
  exports: [SourceDocumentRepository],
})
export class MemoryModule {}
