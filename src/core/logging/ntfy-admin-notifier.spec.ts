import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { NtfyAdminNotifier } from './ntfy-admin-notifier.js';

const HOUR = 3_600_000;

/** ntfy 서버 대신 받은 요청을 모으는 로컬 HTTP 서버. */
const received: { path: string; headers: IncomingHttpHeaders; body: string }[] = [];
let status = 200;
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => (body += chunk.toString()));
    req.on('end', () => {
      received.push({ path: req.url ?? '', headers: req.headers, body });
      res.writeHead(status).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('서버 주소를 알 수 없다');
  baseUrl = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  received.length = 0;
  status = 200;
});
afterAll(() => new Promise((resolve) => server.close(resolve)));

const setup = () => {
  const clock = new FixedClock(new Date('2026-10-20T00:00:00Z'));
  return { clock, notifier: new NtfyAdminNotifier(new URL(`${baseUrl}/test-topic`), clock) };
};
const decodeHeader = (value: unknown) =>
  Buffer.from(String(value).replace(/^=\?UTF-8\?B\?(.*)\?=$/, '$1'), 'base64').toString();

describe('NtfyAdminNotifier', () => {
  it('토픽에 제목·우선순위·태그를 붙여 보내고, 본문에는 시각만 싣고 자세한 내용은 싣지 않는다', async () => {
    const { notifier } = setup();

    await notifier.notify('LOGIN_REJECTED', '허용 목록에 없는 이메일 other@example.com');

    expect(received).toHaveLength(1);
    const [request] = received;
    expect(request?.path).toBe('/test-topic');
    expect(decodeHeader(request?.headers.title)).toBe('허용되지 않은 계정이 로그인을 시도했다');
    expect(request?.headers).toMatchObject({ priority: 'high', tags: 'warning' });
    expect(request?.body).toBe('2026-10-20 09:00:00. 자세한 내용은 서버 로그를 본다.');
  });

  it('리프레시 토큰 재사용(탈취 의심)만 우선순위가 urgent다', async () => {
    const { notifier } = setup();

    await notifier.notify('REFRESH_TOKEN_REUSE', '계열 1');
    await notifier.notify('SCHEDULED_JOB_FAILED', 'nightly-prep');

    expect(received.map((r) => r.headers.priority)).toEqual(['urgent', 'high']);
  });

  it('1시간 안의 같은 종류는 보내지 않고, 1시간 뒤 알림에 그 건수를 붙인다', async () => {
    const { clock, notifier } = setup();

    await notifier.notify('REFRESH_TOKEN_REUSE', '계열 1');
    await notifier.notify('REFRESH_TOKEN_REUSE', '계열 2');
    await notifier.notify('REFRESH_TOKEN_REUSE', '계열 3');
    clock.advance(HOUR);
    await notifier.notify('REFRESH_TOKEN_REUSE', '계열 4');

    expect(received.map((r) => r.body)).toEqual([
      '2026-10-20 09:00:00. 자세한 내용은 서버 로그를 본다.',
      '2026-10-20 10:00:00 외 2건. 자세한 내용은 서버 로그를 본다.',
    ]);
  });

  it('ntfy가 실패하거나 닿지 않아도 예외를 던지지 않는다', async () => {
    status = 500;
    await expect(setup().notifier.notify('CLAUDE_CLI_AUTH', 'x')).resolves.toBeUndefined();

    const unreachable = new NtfyAdminNotifier(new URL('http://127.0.0.1:1/topic'), new FixedClock(new Date()));
    await expect(unreachable.notify('CLAUDE_CLI_AUTH', 'x')).resolves.toBeUndefined();
  });
});
