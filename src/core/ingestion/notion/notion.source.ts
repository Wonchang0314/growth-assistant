import { DocumentSource, type DocumentRef } from '../document-source.js';
import type { NotionApi } from './notion-api.js';
import {
  type BlockNode,
  blocksToChunks,
  inScope,
  normalizeId,
  pageTitle,
  propertiesChunk,
  SEPARATE_DOCUMENT_BLOCKS,
} from './notion-content.js';

/**
 * Notion 어댑터. 통합에 공유된 항목을 검색으로 모두 받아 상위를 따라가며 수집 루트 아래의 페이지만 고른다.
 * 페이지 트리를 블록으로 훑는 것보다 호출이 훨씬 적다 (검색은 100개씩).
 */
export class NotionSource extends DocumentSource {
  readonly source = 'NOTION';

  constructor(
    private readonly api: NotionApi,
    private readonly roots: readonly string[],
  ) {
    super();
  }

  async list(): Promise<DocumentRef[]> {
    if (this.roots.length === 0)
      throw new Error('NOTION_ROOT_IDS가 비어 있다. 수집할 루트 페이지·DB ID를 .env에 넣는다');
    const items = await this.api.searchAll();
    const parentOf = new Map(items.map((i) => [normalizeId(i.id), i.parent && normalizeId(i.parent)]));
    await this.resolveBlockParents(parentOf);
    const scope = inScope(parentOf, this.roots);
    return items.flatMap((i) =>
      i.object === 'page' && !i.in_trash && !i.archived && scope.has(normalizeId(i.id))
        ? [
            {
              externalId: normalizeId(i.id),
              title: pageTitle(i.properties) || '(제목 없음)',
              url: i.url,
              updatedAt: i.last_edited_time,
            },
          ]
        : [],
    );
  }

  async fetchChunks(ref: DocumentRef): Promise<string[]> {
    const page = await this.api.retrievePage(ref.externalId);
    const properties = propertiesChunk(page.properties);
    const body = blocksToChunks(await this.tree(ref.externalId));
    return properties ? [properties, ...body] : body;
  }

  private async tree(blockId: string): Promise<BlockNode[]> {
    const blocks = await this.api.children(blockId);
    const nodes: BlockNode[] = [];
    for (const b of blocks) {
      const descend = b.hasChildren && !SEPARATE_DOCUMENT_BLOCKS.has(b.type);
      nodes.push({ ...b, children: descend ? await this.tree(b.id) : [] });
    }
    return nodes;
  }

  /** 블록 안에 놓인 페이지는 상위가 블록이라 검색 결과만으로는 상위 페이지를 모른다. 블록을 따라 올라가 채운다. */
  private async resolveBlockParents(parentOf: Map<string, string | null>): Promise<void> {
    const pending = () =>
      [...new Set([...parentOf.values()])].filter((p): p is string => p !== null && !parentOf.has(p));
    for (let ids = pending(); ids.length > 0; ids = pending()) {
      for (const id of ids) {
        const parent = await this.api.blockParent(id).catch(() => null);
        parentOf.set(id, parent && normalizeId(parent));
      }
    }
  }
}
