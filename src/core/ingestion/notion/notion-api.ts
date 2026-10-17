import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';

/*
 * Notion REST API 중 수집에 쓰는 것만 부르는 얇은 클라이언트. 응답은 여기서 한 번 파싱한다.
 * 2022-06-28 버전을 쓴다. 이후 버전은 DB를 data source로 나눠 응답 모양이 다르다.
 */
const NOTION_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';
/** Notion 평균 허용치(초당 3회)보다 조금 느리게 부른다. */
const MIN_INTERVAL_MS = 350;
const MAX_ATTEMPTS = 4;

const richText = z.array(z.object({ plain_text: z.string() }));
export const plainText = (rt: z.infer<typeof richText>) => rt.map((t) => t.plain_text).join('');

const parent = z
  .object({
    type: z.string(),
    page_id: z.string().optional(),
    database_id: z.string().optional(),
    block_id: z.string().optional(),
  })
  .transform((p) => p.page_id ?? p.database_id ?? p.block_id ?? null);

/** 페이지 속성. 본문에 넣을 만한 종류만 읽고 나머지는 [type]만 남긴다. */
const propertyValue = z.union([
  z.object({ type: z.literal('title'), title: richText }),
  z.object({ type: z.literal('rich_text'), rich_text: richText }),
  z.object({ type: z.literal('select'), select: z.object({ name: z.string() }).nullable() }),
  z.object({ type: z.literal('status'), status: z.object({ name: z.string() }).nullable() }),
  z.object({ type: z.literal('multi_select'), multi_select: z.array(z.object({ name: z.string() })) }),
  z.object({ type: z.literal('date'), date: z.object({ start: z.string() }).nullable() }),
  z.object({ type: z.literal('number'), number: z.number().nullable() }),
  z.object({ type: z.literal('checkbox'), checkbox: z.boolean() }),
  z.object({ type: z.literal('url'), url: z.string().nullable() }),
  z.object({ type: z.string() }),
]);
export type NotionProperty = z.infer<typeof propertyValue>;

const page = z.object({
  object: z.literal('page'),
  id: z.string(),
  url: z.string(),
  last_edited_time: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  in_trash: z.boolean().optional(),
  archived: z.boolean().optional(),
  parent,
  properties: z.record(z.string(), propertyValue),
});
const database = z.object({ object: z.literal('database'), id: z.string(), parent, title: richText });

export type NotionPage = z.infer<typeof page>;
export type NotionSearchItem = z.infer<typeof page> | z.infer<typeof database>;

/** 블록 종류마다 내용 필드 이름이 블록 종류와 같다 (`{ type: 'paragraph', paragraph: { rich_text } }`). */
const blockContent = z.object({
  rich_text: richText.optional(),
  checked: z.boolean().optional(),
  language: z.string().optional(),
  caption: richText.optional(),
  cells: z.array(richText).optional(),
  expression: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
});
const block = z.looseObject({ id: z.string(), type: z.string(), has_children: z.boolean() }).transform((b) => ({
  id: b.id,
  type: b.type,
  hasChildren: b.has_children,
  content: blockContent.catch({}).parse(b[b.type] ?? {}),
}));
export type NotionBlock = z.infer<typeof block>;

const blockParent = z.object({ parent });

const listOf = <T extends z.ZodType>(item: T) =>
  z.object({ results: z.array(item), has_more: z.boolean(), next_cursor: z.string().nullable() });

export class NotionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`Notion ${status} ${code}: ${message}`);
  }
}
const errorBody = z.object({ code: z.string(), message: z.string() }).catch({ code: 'unknown', message: '' });

export interface NotionApiOptions {
  readonly token: string | undefined;
  readonly fetch?: typeof fetch;
  readonly minIntervalMs?: number;
  readonly sleep?: (ms: number) => Promise<unknown>;
}

export class NotionApi {
  private readonly fetchFn: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly sleep: (ms: number) => Promise<unknown>;
  private nextAt = 0;

  constructor(private readonly options: NotionApiOptions) {
    this.fetchFn = options.fetch ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? MIN_INTERVAL_MS;
    this.sleep = options.sleep ?? sleep;
  }

  /** 통합에 공유된 페이지와 DB 전체. */
  async searchAll(): Promise<NotionSearchItem[]> {
    const item = z.union([page, database, z.object({ object: z.string() })]);
    const all = await this.paginate((cursor) =>
      this.request('POST', '/search', listOf(item), { page_size: 100, ...(cursor && { start_cursor: cursor }) }),
    );
    return all.filter((i): i is NotionSearchItem => i.object === 'page' || i.object === 'database');
  }

  async retrievePage(id: string): Promise<NotionPage> {
    return this.request('GET', `/pages/${id}`, page);
  }

  /** 블록의 상위(페이지·DB·블록) ID. 페이지가 다른 블록 안에 있을 때 상위 페이지를 찾는 데 쓴다. */
  async blockParent(id: string): Promise<string | null> {
    return (await this.request('GET', `/blocks/${id}`, blockParent)).parent;
  }

  /** 블록(페이지)의 바로 아래 블록 전체. */
  async children(id: string): Promise<NotionBlock[]> {
    return this.paginate((cursor) =>
      this.request(
        'GET',
        `/blocks/${id}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
        listOf(block),
      ),
    );
  }

  private async paginate<T>(
    fetchPage: (cursor: string | null) => Promise<{ results: T[]; has_more: boolean; next_cursor: string | null }>,
  ): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | null = null;
    do {
      const res = await fetchPage(cursor);
      all.push(...res.results);
      cursor = res.has_more ? res.next_cursor : null;
    } while (cursor);
    return all;
  }

  /** 호출 간격을 지키고, 429·5xx는 기다렸다가 다시 부른다. */
  private async request<T extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: T,
    body?: object,
  ): Promise<z.output<T>> {
    const token = this.options.token;
    if (!token) throw new Error('NOTION_TOKEN이 없다. .env에 Notion 통합 토큰을 넣는다');
    for (let attempt = 1; ; attempt++) {
      const wait = this.nextAt - Date.now();
      if (wait > 0) await this.sleep(wait);
      this.nextAt = Date.now() + this.minIntervalMs;

      const res = await this.fetchFn(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        ...(body && { body: JSON.stringify(body) }),
      });
      if (res.ok) return schema.parse(await res.json());

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) {
        const err = errorBody.parse(await res.json().catch(() => ({})));
        throw new NotionApiError(res.status, err.code, err.message);
      }
      const retryAfter = Number(res.headers.get('retry-after'));
      await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** (attempt - 1));
    }
  }
}
