import { type NotionBlock, type NotionProperty, plainText } from './notion-api.js';

/** 하위 블록까지 읽은 블록. */
export type BlockNode = NotionBlock & { readonly children: readonly BlockNode[] };

/** 하위 페이지·DB는 따로 수집하는 문서라 본문을 따라 들어가지 않는다. */
export const SEPARATE_DOCUMENT_BLOCKS: ReadonlySet<string> = new Set(['child_page', 'child_database']);

const HEADINGS: Readonly<Record<string, string>> = { heading_1: '#', heading_2: '##', heading_3: '###' };

/** 블록 한 줄. 제목·목록·인용 같은 구조는 마크다운 기호로 남긴다. 담을 글이 없는 블록(구분선, 열)은 빈 문자열. */
export function blockLine(block: NotionBlock): string {
  const { content } = block;
  const text = plainText(content.rich_text ?? []);
  const caption = plainText(content.caption ?? []);
  const heading = HEADINGS[block.type];
  if (heading) return `${heading} ${text}`;
  switch (block.type) {
    case 'bulleted_list_item':
      return `- ${text}`;
    case 'numbered_list_item':
      return `1. ${text}`;
    case 'to_do':
      return `[${content.checked ? 'x' : ' '}] ${text}`;
    case 'quote':
      return `> ${text}`;
    case 'code':
      return `\`\`\`${content.language ?? ''}\n${text}\n\`\`\``;
    case 'equation':
      return content.expression ?? '';
    case 'table_row':
      return (content.cells ?? []).map(plainText).join(' | ');
    case 'image':
    case 'file':
    case 'pdf':
    case 'video':
      return caption ? `[${block.type}] ${caption}` : '';
    case 'bookmark':
    case 'embed':
    case 'link_preview':
      return content.url ?? '';
    case 'child_page':
      return `[하위 페이지] ${content.title ?? ''}`;
    case 'child_database':
      return `[하위 DB] ${content.title ?? ''}`;
    default:
      return text;
  }
}

/** 블록과 하위 블록을 들여쓴 줄로 바꾼다. 글이 없는 블록(열, 표)은 들여쓰지 않고 하위 블록만 남긴다. */
function renderLines(node: BlockNode, depth: number): string[] {
  const line = blockLine(node);
  const childDepth = line ? depth + 1 : depth;
  const own = line ? [`${'  '.repeat(depth)}${line.replaceAll('\n', `\n${'  '.repeat(depth)}`)}`] : [];
  return [...own, ...node.children.flatMap((c) => renderLines(c, childDepth))];
}

/**
 * 페이지 본문을 청크로 나눈다. 최상위 제목 블록마다 새 청크를 시작하고, 제목 앞의 블록은 첫 청크가 된다.
 * 블록 하나씩 나누면 목록 한 줄이 청크 하나가 되어, 바뀐 청크만 넘길 때(설계 문서 7.1) 맥락이 끊긴다.
 */
export function blocksToChunks(blocks: readonly BlockNode[]): string[] {
  const sections: string[][] = [[]];
  for (const block of blocks) {
    if (block.type in HEADINGS && sections.at(-1)?.length) sections.push([]);
    sections.at(-1)?.push(...renderLines(block, 0));
  }
  return sections.map((lines) => lines.join('\n').trim()).filter((chunk) => chunk.length > 0);
}

/** 페이지 제목 (title 속성). */
export function pageTitle(properties: Readonly<Record<string, NotionProperty>>): string {
  for (const p of Object.values(properties)) if ('title' in p) return plainText(p.title).trim();
  return '';
}

/** 제목 밖의 속성(DB 행의 분류 같은 것)을 한 청크로. 값이 있는 속성이 없으면 null. */
export function propertiesChunk(properties: Readonly<Record<string, NotionProperty>>): string | null {
  const lines = Object.entries(properties).flatMap(([name, p]) => {
    const value = propertyText(p);
    return value ? [`${name}: ${value}`] : [];
  });
  return lines.length > 0 ? lines.join('\n') : null;
}

function propertyText(p: NotionProperty): string {
  if ('rich_text' in p) return plainText(p.rich_text);
  if ('select' in p) return p.select?.name ?? '';
  if ('status' in p) return p.status?.name ?? '';
  if ('multi_select' in p) return p.multi_select.map((o) => o.name).join(', ');
  if ('date' in p) return p.date?.start ?? '';
  if ('number' in p) return p.number === null ? '' : String(p.number);
  if ('checkbox' in p) return p.checkbox ? '예' : '';
  if ('url' in p) return p.url ?? '';
  return '';
}

/** Notion ID 비교용. API는 하이픈을 넣어 돌려주고 URL·설정에는 빠져 있을 수 있다. */
export const normalizeId = (id: string) => id.replaceAll('-', '');

/**
 * 루트 자신이나 그 하위에 있는 항목 ID. [parentOf]는 정규화한 ID → 상위 ID(없으면 null)다.
 * 상위를 끝까지 따라가도 루트를 만나지 않으면 범위 밖이다.
 */
export function inScope(parentOf: ReadonlyMap<string, string | null>, roots: readonly string[]): Set<string> {
  const rootSet = new Set(roots.map(normalizeId));
  const result = new Set<string>();
  for (const id of parentOf.keys()) {
    const seen = new Set<string>();
    for (let cur: string | null | undefined = id; cur && !seen.has(cur); cur = parentOf.get(cur)) {
      if (rootSet.has(cur)) {
        result.add(id);
        break;
      }
      seen.add(cur);
    }
  }
  return result;
}
