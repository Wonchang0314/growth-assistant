import type { Client } from '@modelcontextprotocol/client';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { McpServerHost } from '../src/core/mcp/mcp-server.host.js';
import { STUDY_INSTRUCTIONS } from '../src/tutor/study/study-instructions.js';
import { connectTestDb } from './db/test-db.js';
import { FixedClock } from './fakes/fixed-clock.js';
import { NightlyPrepJob } from '../src/tutor/outreach/nightly-prep.job.js';
import { compileMcpRoot, createMcpHttpApp } from './mcp-app.js';
import { connectMcp, signIn } from './oauth-client.js';

const testDb = connectTestDb();
let app: INestApplication;
let baseUrl: string;
let client: Client;

beforeAll(async () => {
  await testDb.truncateAll();
  app = await createMcpHttpApp(new FixedClock(new Date('2026-10-15T09:00:00+09:00')));
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
  // 인증 흐름 자체는 test/oauth.db.spec.ts가 본다. 여기서는 로그인해 받은 토큰으로 붙기만 한다.
  client = await connectMcp(baseUrl, (await signIn(baseUrl)).access_token);
});
afterAll(async () => {
  await client.close();
  await app.close();
  await testDb.close();
  vi.unstubAllEnvs();
});

describe('MCP HTTP 앱 (앱 전체)', () => {
  it('stdio와 같은 도구와 사용 지침을 /mcp로 준다', async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(app.get(McpServerHost).toolNames.sort());
    expect(tools.map((t) => t.name)).toContain('get_review_set');
    expect(client.getInstructions()).toBe(STUDY_INSTRUCTIONS);
  });

  it('도구를 불러 DB에서 읽은 결과를 돌려준다', async () => {
    const result = await client.callTool({ name: 'sync_status', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ lastSyncedAt: null, documents: 0, chunks: 0 });
  });

  it('없는 경로는 404, /mcp에 다른 사이트의 Origin으로 오면 403으로 거절한다', async () => {
    const other = await fetch(new URL('/', baseUrl));
    const foreign = await fetch(new URL('/mcp', baseUrl), {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });

    expect(other.status).toBe(404);
    expect(foreign.status).toBe(403);
  });

  it('상시 실행 서버의 루트 모듈(스케줄러와 예약 작업을 더함)도 의존성을 모두 푼다', async () => {
    // 띄우지(init) 않으므로 예약 작업은 돌지 않는다.
    const server = await compileMcpRoot(
      new FixedClock(new Date('2026-10-15T09:00:00+09:00')),
      async () => (await import('../src/mcp-http-app.module.js')).McpHttpServerModule,
    );

    expect(server.get(NightlyPrepJob).at).toBe('04:00');
    await server.close();
  });

  it('/healthz는 DB에 닿으면 200이다', async () => {
    const res = await fetch(new URL('/healthz', baseUrl));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
