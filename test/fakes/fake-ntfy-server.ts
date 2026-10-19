import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach } from 'vitest';

export interface FakeNtfyServer {
  /** 받은 요청. 테스트마다 비운다. */
  readonly received: { path: string; headers: IncomingHttpHeaders; body: string }[];
  /** 돌려줄 HTTP 상태. 테스트마다 200으로 되돌린다. */
  status: number;
  /** `http://127.0.0.1:<port>`. 서버가 뜬 뒤(`beforeAll` 뒤) 읽는다. */
  baseUrl: string;
}

/** ntfy 서버 대신 받은 요청을 모으는 로컬 HTTP 서버. 테스트 파일 맨 위에서 부르면 파일 동안 띄운다. */
export function fakeNtfyServer(): FakeNtfyServer {
  const state: FakeNtfyServer = { received: [], status: 200, baseUrl: '' };
  let server: Server;
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        state.received.push({ path: req.url ?? '', headers: req.headers, body });
        res.writeHead(state.status).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (typeof address !== 'object' || !address) throw new Error('서버 주소를 알 수 없다');
    state.baseUrl = `http://127.0.0.1:${address.port}`;
  });
  beforeEach(() => {
    state.received.length = 0;
    state.status = 200;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  return state;
}

/** RFC 2047로 감싼 ntfy 헤더(제목)를 푼다. */
export const decodeNtfyHeader = (value: unknown) =>
  Buffer.from(String(value).replace(/^=\?UTF-8\?B\?(.*)\?=$/, '$1'), 'base64').toString();
