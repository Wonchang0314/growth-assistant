import { Test } from '@nestjs/testing';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { Clock } from '../src/core/clock/clock.js';
import { McpServerHost } from '../src/core/mcp/mcp-server.host.js';
import { connectTestDb } from './db/test-db.js';
import { FixedClock } from './fakes/fixed-clock.js';

const testDb = connectTestDb();
const clock = new FixedClock(new Date('2026-10-15T09:00:00+09:00'));
let client: Client;
let close: () => Promise<void>;

beforeAll(async () => {
  const database = inject('database');
  vi.stubEnv('POSTGRES_HOST', database.host);
  vi.stubEnv('POSTGRES_PORT', String(database.port));
  vi.stubEnv('POSTGRES_DB', database.database);
  vi.stubEnv('POSTGRES_USER', database.user);
  vi.stubEnv('POSTGRES_PASSWORD', database.password);
  // ConfigModule.forRoot()는 모듈을 불러올 때 환경 변수를 읽으므로 값을 바꾼 뒤 불러온다.
  const { McpAppModule } = await import('../src/mcp-app.module.js');

  const app = await Test.createTestingModule({ imports: [McpAppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  await app.init();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await app.get(McpServerHost).connect(serverTransport);
  client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientTransport);
  close = async () => {
    await client.close();
    await app.close();
  };
});

beforeEach(() => testDb.truncateAll());
afterAll(async () => {
  await close();
  await testDb.close();
  vi.unstubAllEnvs();
});

describe('McpAppModule (MCP 클라이언트로 도구 호출)', () => {
  it('1단계 도구 두 개를 등록한다', async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(['get_learning_context', 'record_study_note']);
    expect(tools.find((t) => t.name === 'get_learning_context')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'record_study_note')?.annotations?.readOnlyHint).toBe(false);
  });

  it('기록이 없으면 그렇다고 알려 준다', async () => {
    const result = await client.callTool({ name: 'get_learning_context', arguments: { topic: '인덱스' } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ topic: '인덱스', relatedNotes: [], recentNotes: [] });
    expect(JSON.stringify(result.content)).toContain('아직 학습 기록이 없다');
  });

  it('record_study_note로 남긴 기록을 get_learning_context가 주제로 찾는다', async () => {
    const recorded = await client.callTool({
      name: 'record_study_note',
      arguments: {
        topic: 'PostgreSQL 인덱스',
        summary: 'B-Tree 인덱스는 정렬된 키로 범위 검색을 빠르게 한다',
        confusedPoints: ['선택도가 낮은 컬럼에도 인덱스가 효과 있다고 생각함'],
      },
    });
    await client.callTool({ name: 'record_study_note', arguments: { topic: 'TCP 혼잡 제어', summary: '슬로 스타트' } });

    const result = await client.callTool({ name: 'get_learning_context', arguments: { topic: '인덱스 설계' } });

    expect(recorded.content).toContainEqual({
      type: 'text',
      text: '학습 기록 #1 저장: PostgreSQL 인덱스 (헷갈린 점 1개)',
    });
    expect(result.structuredContent).toEqual({
      topic: '인덱스 설계',
      relatedNotes: [
        {
          id: 1,
          topic: 'PostgreSQL 인덱스',
          summary: 'B-Tree 인덱스는 정렬된 키로 범위 검색을 빠르게 한다',
          confusedPoints: ['선택도가 낮은 컬럼에도 인덱스가 효과 있다고 생각함'],
          answerRevealed: false,
          date: '2026-10-15',
        },
      ],
      recentNotes: [expect.objectContaining({ id: 2, topic: 'TCP 혼잡 제어', confusedPoints: [] })],
    });
  });

  it('입력이 스키마에 맞지 않으면 저장하지 않고 오류를 돌려준다', async () => {
    const result = await client.callTool({ name: 'record_study_note', arguments: { topic: '', summary: '요약' } });

    expect(result.isError).toBe(true);
    expect(await testDb.count('study_note')).toBe(0);
  });
});
