import { Test } from '@nestjs/testing';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it, vi } from 'vitest';
import { Clock } from '../src/core/clock/clock.js';
import { eq } from 'drizzle-orm';
import { ConceptRepository } from '../src/core/knowledge/concept.repository.js';
import { concept, track } from '../src/core/knowledge/concept.schema.js';
import type { ConceptSeed } from '../src/core/knowledge/concept-seed.js';
import { McpServerHost } from '../src/core/mcp/mcp-server.host.js';
import { ExperienceRepository } from '../src/core/memory/experience.repository.js';
import { SourceDocumentRepository } from '../src/core/memory/source-document.repository.js';
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

// 실제 시드 대신 작은 개념 그래프를 쓴다. 시드를 고쳐도 이 테스트가 흔들리지 않게.
const seed: ConceptSeed = {
  tracks: [
    { key: 'cs', name: 'CS 기초', weight: 0.5, description: '원리' },
    { key: 'backend', name: '백엔드', weight: 0.5, description: '애플리케이션' },
  ],
  concepts: [
    {
      name: '인덱스 원리',
      track: 'cs',
      aliases: ['인덱스', 'index'],
      description: '인덱스 구조',
      requires: [],
      related: [],
    },
    {
      name: 'B-tree 인덱스',
      track: 'cs',
      parent: '인덱스 원리',
      aliases: [],
      description: '정렬 트리',
      requires: [],
      related: [],
    },
    {
      name: '복합 인덱스 설계',
      track: 'backend',
      aliases: [],
      description: '선두 컬럼',
      requires: ['B-tree 인덱스'],
      related: [],
    },
    { name: 'TCP 혼잡 제어', track: 'cs', aliases: [], description: '슬로 스타트', requires: [], related: [] },
  ],
};

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(seed, clock.now());
});
afterAll(async () => {
  await close();
  await testDb.close();
  vi.unstubAllEnvs();
});

describe('McpAppModule (MCP 클라이언트로 도구 호출)', () => {
  it('학습 도구와 수집 상태 도구를 등록한다', async () => {
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([
      'get_learning_context',
      'list_pending_concepts',
      'record_study_note',
      'review_concept',
      'search_experience',
      'sync_status',
    ]);
    expect(tools.find((t) => t.name === 'get_learning_context')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'record_study_note')?.annotations?.readOnlyHint).toBe(false);
  });

  it('NOTION_TOKEN 없이도 뜨고, 동기화 전이면 아직 하지 않았다고 알려 준다', async () => {
    const result = await client.callTool({ name: 'sync_status', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ lastSyncedAt: null, documents: 0, chunks: 0 });
    expect(JSON.stringify(result.content)).toContain('아직 동기화하지 않음');
  });

  it('관련 개념도 기록도 없으면 그렇다고 알려 준다', async () => {
    const result = await client.callTool({ name: 'get_learning_context', arguments: { topic: '양자역학' } });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({
      topic: '양자역학',
      concepts: [],
      experiences: [],
      relatedNotes: [],
      recentNotes: [],
    });
    expect(JSON.stringify(result.content)).toContain('아직 학습 기록이 없다');
  });

  it('주제와 관련된 개념을 상위 개념·선수 개념과 함께 돌려준다', async () => {
    const result = await client.callTool({ name: 'get_learning_context', arguments: { topic: '복합 인덱스' } });

    expect((result.structuredContent as { concepts: unknown }).concepts).toEqual([
      { name: '인덱스 원리', track: 'CS 기초', description: '인덱스 구조', parent: null, prerequisites: [] },
      {
        name: '복합 인덱스 설계',
        track: '백엔드',
        description: '선두 컬럼',
        parent: null,
        prerequisites: ['B-tree 인덱스'],
      },
      { name: 'B-tree 인덱스', track: 'CS 기초', description: '정렬 트리', parent: '인덱스 원리', prerequisites: [] },
    ]);
    expect(JSON.stringify(result.content)).toContain('먼저 알아야 할 개념: B-tree 인덱스');
  });

  it('record_study_note가 기록을 개념에 연결하고, get_learning_context가 주제 글자나 개념으로 찾는다', async () => {
    const recorded = await client.callTool({
      name: 'record_study_note',
      arguments: {
        topic: 'PostgreSQL 인덱스',
        summary: 'B-Tree 인덱스는 정렬된 키로 범위 검색을 빠르게 한다',
        confusedPoints: ['선택도가 낮은 컬럼에도 인덱스가 효과 있다고 생각함'],
        concepts: [{ name: '인덱스', signal: 'CONFUSED' }, { name: '없는 개념' }],
      },
    });
    await client.callTool({ name: 'record_study_note', arguments: { topic: 'TCP 혼잡 제어', summary: '슬로 스타트' } });

    // "index"는 기록 글자에는 없지만 개념 "인덱스 원리"의 별칭이라 연결된 기록을 찾는다.
    const result = await client.callTool({ name: 'get_learning_context', arguments: { topic: 'index' } });

    expect(recorded.content).toContainEqual({
      type: 'text',
      text: '학습 기록 #1 저장: PostgreSQL 인덱스 (헷갈린 점 1개, 연결한 개념 1개)\n개념 목록에 없어 연결하지 않음: 없는 개념',
    });
    expect(recorded.structuredContent).toMatchObject({ concepts: ['인덱스 원리'], unknownConcepts: ['없는 개념'] });
    expect(result.structuredContent).toEqual({
      topic: 'index',
      concepts: [expect.objectContaining({ name: '인덱스 원리' })],
      experiences: [],
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

  describe('경험 카드', () => {
    beforeEach(async () => {
      const documents = new SourceDocumentRepository(testDb.db);
      await documents.save(
        'NOTION',
        { externalId: 'a', title: '인덱스 사고', url: 'https://notion.so/a', updatedAt: clock.now(), chunks: ['본문'] },
        clock.now(),
      );
      const [doc] = await documents.findForExtraction({});
      const indexId = (await testDb.db.select().from(concept).where(eq(concept.name, '인덱스 원리')))[0]?.id ?? -1;
      const card = (title: string, lesson: string, concepts: number[]) => ({
        projectName: 'GIS',
        title,
        situation: '조회가 느렸다',
        task: '원인 찾기',
        action: '처음에는 캐시를 의심했다',
        result: '함수로 감싼 컬럼이 원인',
        lesson,
        occurredAt: '2026-03-02',
        concepts,
      });
      await new ExperienceRepository(testDb.db).saveExtraction({
        documentId: doc?.id ?? -1,
        summary: '',
        cards: [
          card('함수로 감싼 컬럼이 인덱스를 못 탐', '컬럼을 함수로 감싸면 인덱스를 쓰지 못한다', [indexId]),
          card('마커가 깜빡임', 'keepPreviousData는 useQueries 안에서 동작하지 않는다', []),
        ],
        newConcepts: [],
        aliasAdds: [],
        now: clock.now(),
      });
    });

    it('get_learning_context가 관련 개념에 연결된 경험 카드를 원문 문서와 함께 준다', async () => {
      const result = await client.callTool({ name: 'get_learning_context', arguments: { topic: '인덱스' } });

      expect((result.structuredContent as { experiences: unknown }).experiences).toEqual([
        {
          id: 1,
          title: '함수로 감싼 컬럼이 인덱스를 못 탐',
          projectName: 'GIS',
          occurredAt: '2026-03-02',
          situation: '조회가 느렸다',
          lesson: '컬럼을 함수로 감싸면 인덱스를 쓰지 못한다',
          document: { title: '인덱스 사고', url: 'https://notion.so/a' },
        },
      ]);
      expect(JSON.stringify(result.content)).toContain(
        '[경험] 함수로 감싼 컬럼이 인덱스를 못 탐 (GIS, 2026-03-02): 컬럼을 함수로 감싸면 인덱스를 쓰지 못한다',
      );
    });

    it('search_experience가 개념이 없는 카드도 글자로 찾아 STAR+L 전체를 준다', async () => {
      const result = await client.callTool({ name: 'search_experience', arguments: { query: 'keepPreviousData' } });

      expect(result.structuredContent).toMatchObject({
        query: 'keepPreviousData',
        experiences: [
          { title: '마커가 깜빡임', action: '처음에는 캐시를 의심했다', result: '함수로 감싼 컬럼이 원인' },
        ],
      });
      expect(JSON.stringify(result.content)).toContain('행동: 처음에는 캐시를 의심했다');
    });

    it('search_experience는 개념으로 찾은 카드를 먼저 주고, 못 찾으면 그렇다고 알려 준다', async () => {
      const found = await client.callTool({ name: 'search_experience', arguments: { query: 'index 컬럼' } });
      const none = await client.callTool({ name: 'search_experience', arguments: { query: '쿠버네티스' } });

      expect((found.structuredContent as { experiences: { title: string }[] }).experiences.map((e) => e.title)).toEqual(
        ['함수로 감싼 컬럼이 인덱스를 못 탐', '마커가 깜빡임'],
      );
      expect(none.structuredContent).toMatchObject({ experiences: [] });
      expect(JSON.stringify(none.content)).toContain('찾은 경험 카드가 없다');
    });
  });

  it('승인 대기 개념을 보여 주고, review_concept로 고쳐서 승인하면 학습 맥락에 나온다', async () => {
    await testDb.db.insert(concept).values({
      trackId: (await testDb.db.select({ id: track.id }).from(track).where(eq(track.key, 'cs')))[0]?.id ?? -1,
      name: '공간 인덱스와 PostGIS',
      aliases: ['GiST'],
      description: '좌표 범위 검색',
      status: 'PROPOSED',
      origin: 'INGESTION',
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });

    const pending = await client.callTool({ name: 'list_pending_concepts', arguments: {} });
    expect(JSON.stringify(pending.content)).toContain('공간 인덱스와 PostGIS [승인 대기] cs, 카드 0장');
    const before = await client.callTool({ name: 'get_learning_context', arguments: { topic: 'GiST' } });
    expect((before.structuredContent as { concepts: unknown }).concepts).toEqual([]);

    const reviewed = await client.callTool({
      name: 'review_concept',
      arguments: { concept: '공간 인덱스와 PostGIS', action: 'APPROVE', name: '공간 인덱스', parent: '인덱스 원리' },
    });

    expect(reviewed.content).toEqual([{ type: 'text', text: '승인: 공간 인덱스 (이전 이름 공간 인덱스와 PostGIS)' }]);
    const context = await client.callTool({ name: 'get_learning_context', arguments: { topic: '공간 인덱스' } });
    expect((context.structuredContent as { concepts: unknown }).concepts).toContainEqual(
      expect.objectContaining({ name: '공간 인덱스', parent: '인덱스 원리' }),
    );
  });

  it('MERGE에 합칠 개념을 주지 않으면 오류를 돌려준다', async () => {
    const result = await client.callTool({ name: 'review_concept', arguments: { concept: '인덱스', action: 'MERGE' } });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('MERGE에는 into');
  });

  it('입력이 스키마에 맞지 않으면 저장하지 않고 오류를 돌려준다', async () => {
    const result = await client.callTool({ name: 'record_study_note', arguments: { topic: '', summary: '요약' } });

    expect(result.isError).toBe(true);
    expect(await testDb.count('study_note')).toBe(0);
  });
});
