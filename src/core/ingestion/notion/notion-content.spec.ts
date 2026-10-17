import { describe, expect, it } from 'vitest';
import { type BlockNode, blocksToChunks, inScope, pageTitle, propertiesChunk } from './notion-content.js';

const rt = (text: string) => [{ plain_text: text }];
const node = (type: string, content: BlockNode['content'], children: BlockNode[] = []): BlockNode => ({
  id: `${type}-${Math.random()}`,
  type,
  hasChildren: children.length > 0,
  content,
  children,
});
const p = (text: string, children: BlockNode[] = []) => node('paragraph', { rich_text: rt(text) }, children);

describe('blocksToChunks', () => {
  it('최상위 제목마다 청크를 나누고, 제목 앞 블록은 첫 청크가 된다', () => {
    const chunks = blocksToChunks([
      p('들어가며'),
      node('heading_2', { rich_text: rt('문제') }),
      node('bulleted_list_item', { rich_text: rt('느린 쿼리') }),
      node('heading_2', { rich_text: rt('해결') }),
      p('인덱스 추가'),
    ]);
    expect(chunks).toEqual(['들어가며', '## 문제\n- 느린 쿼리', '## 해결\n인덱스 추가']);
  });

  it('하위 블록은 들여쓰고, 글이 없는 블록(열)은 하위 블록만 남긴다', () => {
    const chunks = blocksToChunks([
      node('toggle', { rich_text: rt('왜?') }, [p('이유')]),
      node('column_list', {}, [node('column', {}, [p('왼쪽')])]),
      node('divider', {}),
    ]);
    expect(chunks).toEqual(['왜?\n  이유\n왼쪽']);
  });

  it.each([
    { name: '할 일', block: node('to_do', { rich_text: rt('배포'), checked: true }), line: '[x] 배포' },
    {
      name: '코드',
      block: node('code', { rich_text: rt('SELECT 1'), language: 'sql' }),
      line: '```sql\nSELECT 1\n```',
    },
    { name: '표 행', block: node('table_row', { cells: [rt('a'), rt('b')] }), line: 'a | b' },
    { name: '하위 페이지', block: node('child_page', { title: '부록' }), line: '[하위 페이지] 부록' },
    { name: '캡션 없는 이미지는 뺀다', block: node('image', {}), line: undefined },
  ])('$name', ({ block, line }) => {
    expect(blocksToChunks([block])[0]).toBe(line);
  });
});

describe('속성', () => {
  const properties = {
    제목: { type: 'title', title: rt('고객수 집계') },
    섹션: { type: 'select', select: { name: '성능 최적화' } },
    태그: { type: 'multi_select', multi_select: [{ name: 'SQL' }, { name: '배치' }] },
    비고: { type: 'rich_text', rich_text: [] },
    생성일: { type: 'created_time' },
  };

  it('제목은 title 속성에서 읽는다', () => {
    expect(pageTitle(properties)).toBe('고객수 집계');
  });

  it('값이 있는 분류 속성만 한 청크로 모은다', () => {
    expect(propertiesChunk(properties)).toBe('섹션: 성능 최적화\n태그: SQL, 배치');
    expect(propertiesChunk({ 제목: properties.제목 })).toBeNull();
  });
});

describe('inScope', () => {
  const parentOf = new Map<string, string | null>([
    ['root', null],
    ['db', 'root'],
    ['row', 'db'],
    ['other', null],
    ['otherchild', 'other'],
    ['loopa', 'loopb'],
    ['loopb', 'loopa'],
  ]);

  it('루트와 그 아래를 따라 내려간 항목만 고른다', () => {
    expect([...inScope(parentOf, ['root'])].sort()).toEqual(['db', 'root', 'row']);
  });

  it('하이픈이 들어간 루트 ID도 같게 본다, 순환은 범위 밖', () => {
    expect([...inScope(parentOf, ['ro-ot'])].sort()).toEqual(['db', 'root', 'row']);
    expect(inScope(parentOf, ['zzz']).size).toBe(0);
  });
});
