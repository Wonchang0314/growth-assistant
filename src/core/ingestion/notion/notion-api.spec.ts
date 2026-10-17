import { describe, expect, it, vi } from 'vitest';
import { NotionApi, NotionApiError } from './notion-api.js';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function apiWith(responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    const next = responses.shift();
    return next ? Promise.resolve(next) : Promise.reject(new Error('응답을 더 준비하지 않았다'));
  });
  const sleep = vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());
  return { api: new NotionApi({ token: 'test-token', fetch, sleep, minIntervalMs: 0 }), fetch, sleep };
}

const paragraph = (id: string, text: string) => ({
  object: 'block',
  id,
  type: 'paragraph',
  has_children: false,
  paragraph: { rich_text: [{ plain_text: text }], color: 'default' },
});

describe('NotionApi', () => {
  it('다음 쪽이 없을 때까지 이어 받고, 블록 내용은 블록 종류 이름의 필드에서 읽는다', async () => {
    const { api, fetch } = apiWith([
      json(200, { results: [paragraph('b1', '하나')], has_more: true, next_cursor: 'c2' }),
      json(200, { results: [paragraph('b2', '둘')], has_more: false, next_cursor: null }),
    ]);
    const blocks = await api.children('page1');
    expect(blocks.map((b) => b.content.rich_text?.[0]?.plain_text)).toEqual(['하나', '둘']);
    expect(fetch.mock.calls[1]?.[0]).toContain('start_cursor=c2');
  });

  it('429면 Retry-After만큼 기다렸다가 다시 부른다', async () => {
    const { api, sleep } = apiWith([
      json(429, { code: 'rate_limited', message: 'slow down' }, { 'retry-after': '2' }),
      json(200, { results: [], has_more: false, next_cursor: null }),
    ]);
    await expect(api.children('page1')).resolves.toEqual([]);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('권한 오류는 다시 부르지 않고 Notion 오류 코드를 담아 던진다', async () => {
    const { api, fetch } = apiWith([json(404, { code: 'object_not_found', message: 'not shared' })]);
    await expect(api.retrievePage('page1')).rejects.toThrow(NotionApiError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('토큰이 없으면 부르기 전에 실패한다', async () => {
    await expect(new NotionApi({ token: undefined }).searchAll()).rejects.toThrow(/NOTION_TOKEN/);
  });

  it('검색 결과에서 페이지와 DB만 남기고 상위 ID를 꺼낸다', async () => {
    const { api } = apiWith([
      json(200, {
        results: [
          {
            object: 'page',
            id: 'p1',
            url: 'https://www.notion.so/p1',
            last_edited_time: '2026-10-16T01:02:03.000Z',
            parent: { type: 'database_id', database_id: 'd1' },
            properties: { 이름: { id: 'title', type: 'title', title: [{ plain_text: '문서' }] } },
          },
          { object: 'database', id: 'd1', parent: { type: 'workspace', workspace: true }, title: [] },
          { object: 'data_source', id: 'x' },
        ],
        has_more: false,
        next_cursor: null,
      }),
    ]);
    const items = await api.searchAll();
    expect(items.map((i) => [i.object, i.id, i.parent])).toEqual([
      ['page', 'p1', 'd1'],
      ['database', 'd1', null],
    ]);
  });
});
