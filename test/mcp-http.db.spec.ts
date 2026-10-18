import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { TestingModule } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { listenMcpHttp, type McpHttpServer } from '../src/core/mcp/mcp-http.server.js';
import { McpServerHost } from '../src/core/mcp/mcp-server.host.js';
import { STUDY_INSTRUCTIONS } from '../src/tutor/study/study-instructions.js';
import { connectTestDb } from './db/test-db.js';
import { FixedClock } from './fakes/fixed-clock.js';
import { startMcpApp } from './mcp-app.js';

const testDb = connectTestDb();
let app: TestingModule;
let server: McpHttpServer;
let client: Client;

beforeAll(async () => {
  await testDb.truncateAll();
  app = await startMcpApp(new FixedClock(new Date('2026-10-15T09:00:00+09:00')));
  server = await listenMcpHttp(app.get(McpServerHost), { hostname: '127.0.0.1', port: 0 });
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(server.url));
});
afterAll(async () => {
  await client.close();
  await server.close();
  await app.close();
  await testDb.close();
  vi.unstubAllEnvs();
});

describe('MCP Streamable HTTP (앱 전체)', () => {
  it('stdio와 같은 도구와 사용 지침을 HTTP로 준다', async () => {
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

  it('/mcp 밖의 경로는 404, 다른 사이트의 Origin은 403으로 거절한다', async () => {
    const other = await fetch(new URL('/', server.url));
    const foreign = await fetch(server.url, {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });

    expect(other.status).toBe(404);
    expect(foreign.status).toBe(403);
  });
});
