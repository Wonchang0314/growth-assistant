import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { ConceptRepository } from '../src/core/knowledge/concept.repository.js';
import { concept, track } from '../src/core/knowledge/concept.schema.js';
import type { ConceptSeed } from '../src/core/knowledge/concept-seed.js';
import { McpServerHost } from '../src/core/mcp/mcp-server.host.js';
import { ExperienceRepository } from '../src/core/memory/experience.repository.js';
import { SourceDocumentRepository } from '../src/core/memory/source-document.repository.js';
import { type ConceptMastery, newMastery } from '../src/tutor/mastery/mastery.js';
import { MasteryRepository } from '../src/tutor/mastery/mastery.repository.js';
import { conceptMastery } from '../src/tutor/mastery/mastery.schema.js';
import { DrizzleQuizQuestionRepository } from '../src/tutor/quiz/infrastructure/drizzle-quiz-question.repository.js';
import { STUDY_INSTRUCTIONS } from '../src/tutor/study/study-instructions.js';
import { studyNoteConcept } from '../src/tutor/study/study-note.schema.js';
import { connectTestDb } from './db/test-db.js';
import { FixedClock } from './fakes/fixed-clock.js';
import { startMcpApp } from './mcp-app.js';

const testDb = connectTestDb();
const clock = new FixedClock(new Date('2026-10-15T09:00:00+09:00'));
let client: Client;
let close: () => Promise<void>;

beforeAll(async () => {
  const app = await startMcpApp(clock);
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
  it('학습 도구와 개념 검토 도구만 등록하고, 사용 지침은 등록한 도구만 가리킨다', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();

    // Notion 수집을 꺼서 수집·경험 카드·판단 사례 도구는 등록하지 않는다(ADR-0042).
    expect(names).toEqual([
      'get_learning_context',
      'get_review_set',
      'get_weakness',
      'list_pending_concepts',
      'record_study_note',
      'report_question',
      'review_concept',
      'submit_answer',
      'update_quiz_guideline',
    ]);
    for (const [, name] of STUDY_INSTRUCTIONS.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) expect(names).toContain(name);
    expect(tools.find((t) => t.name === 'get_learning_context')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === 'record_study_note')?.annotations?.readOnlyHint).toBe(false);
  });

  it('get_review_set은 정답 없이 문제를 복습 카드(ui://)와 글로 내고, submit_answer가 채점해 다음 복습일을 알려 준다', async () => {
    const conceptId = (await testDb.db.select().from(concept).where(eq(concept.name, '인덱스 원리')))[0]?.id ?? -1;
    await new DrizzleQuizQuestionRepository(testDb.db).add({
      conceptId,
      type: 'MULTIPLE_CHOICE',
      // 미측정 개념에는 동작 원리 문제를 낸다(ADR-0038·0040).
      angle: 'MECHANISM',
      keyPoint: '선택도',
      difficulty: 1,
      prompt: '성별 컬럼 인덱스가 느린 이유는?',
      choices: [
        { text: '컬럼이 짧아서', misconception: '짧으면 안 된다고 믿음' },
        { text: '선택도가 낮아서', misconception: null },
      ],
      answer: '선택도가 낮아서',
      explanation: '거의 모든 행을 읽는다',
      referenceMaterial: '근거 자료',
      experienceId: null,
      variantOf: null,
      caseId: null,
      validationStatus: 'VALID',
      validationNote: null,
      createdAt: clock.now(),
    });

    const tool = (await client.listTools()).tools.find((t) => t.name === 'get_review_set');
    const uri = 'ui://growth-assistant/review-card.html';
    const set = await client.callTool({ name: 'get_review_set', arguments: { concept: '인덱스', count: 1 } });
    const view = await client.readResource({ uri });
    const graded = await client.callTool({
      name: 'submit_answer',
      arguments: { questionId: 1, answer: '2', confidence: 'SURE', hintUsed: false },
    });

    expect(tool?._meta).toMatchObject({ ui: { resourceUri: uri } });
    expect(set.structuredContent).toMatchObject({
      questions: [{ questionId: 1, concept: '인덱스 원리', choices: ['컬럼이 짧아서', '선택도가 낮아서'] }],
    });
    expect(JSON.stringify(set.content)).toContain('1. 컬럼이 짧아서\\n2. 선택도가 낮아서');
    for (const secret of ['거의 모든 행', '짧으면 안 된다고', '근거 자료']) {
      expect(JSON.stringify(set)).not.toContain(secret);
    }
    expect(view.contents[0]).toMatchObject({ mimeType: 'text/html;profile=mcp-app' });
    expect(JSON.stringify(view.contents[0])).toContain('submit_answer');
    expect(graded.structuredContent).toMatchObject({ correct: true, correctAnswer: '2. 선택도가 낮아서' });
    expect(JSON.stringify(graded.content)).toContain('다음 복습 2026-10-');
  });

  it('update_quiz_guideline으로 출제 지침을 더하고 빼며, 인자 없이 부르면 지금 지침을 보여 준다', async () => {
    await client.callTool({
      name: 'update_quiz_guideline',
      arguments: { add: ['보기에 코드 조각을 넣지 않는다', '용어는 영문 그대로 쓴다'] },
    });
    await client.callTool({
      name: 'update_quiz_guideline',
      arguments: { remove: ['용어는 영문 그대로 쓴다', '없음'] },
    });

    const result = await client.callTool({ name: 'update_quiz_guideline', arguments: {} });

    expect(result.structuredContent).toEqual({ rules: ['보기에 코드 조각을 넣지 않는다'], notFound: [] });
    expect(JSON.stringify(result.content)).toContain('출제 지침 1개');
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

    const unmeasured = { mastery: 'UNMEASURED', nextReview: null, weakPrerequisites: [] };
    expect((result.structuredContent as { concepts: unknown }).concepts).toEqual([
      {
        name: '인덱스 원리',
        track: 'CS 기초',
        description: '인덱스 구조',
        parent: null,
        prerequisites: [],
        ...unmeasured,
      },
      {
        name: '복합 인덱스 설계',
        track: '백엔드',
        description: '선두 컬럼',
        parent: null,
        prerequisites: ['B-tree 인덱스'],
        ...unmeasured,
        weakPrerequisites: [{ name: 'B-tree 인덱스', level: 'UNSTUDIED', rootCauseOf: [] }],
      },
      {
        name: 'B-tree 인덱스',
        track: 'CS 기초',
        description: '정렬 트리',
        parent: '인덱스 원리',
        prerequisites: [],
        ...unmeasured,
      },
    ]);
    expect(JSON.stringify(result.content)).toContain(
      '먼저 알아야 할 개념: B-tree 인덱스 / 숙련도 미측정 / 약한 선수 개념: B-tree 인덱스(다룬 적 없음)',
    );
  });

  it('개념의 숙련도·다음 복습일과, 2단계까지의 약한 선수 개념을 근본 원인 후보 먼저 돌려준다', async () => {
    // 수익 인식 → 수행의무(미측정) → 계약 식별(다룬 적 없음), 수익 인식 → 거래가격(높음).
    // 약점인 수익 인식·계약 변경이 함께 기대는 계약 식별이 근본 원인 후보다.
    const requires = (name: string, prerequisites: string[]) => ({
      name,
      track: 'backend',
      aliases: [],
      description: name,
      requires: prerequisites,
      related: [],
    });
    await new ConceptRepository(testDb.db).applySeed(
      {
        ...seed,
        concepts: [
          ...seed.concepts,
          requires('수익 인식', ['수행의무', '거래가격']),
          requires('수행의무', ['계약 식별']),
          requires('거래가격', []),
          requires('계약 식별', []),
          requires('계약 변경', ['계약 식별']),
        ],
      },
      clock.now(),
    );
    const ids = new Map((await testDb.db.select().from(concept)).map((c) => [c.name, c.id]));
    const masteries = new MasteryRepository(testDb.db);
    const save = (name: string, scores: Pick<ConceptMastery, 'gradedAttempts' | 'weaknessScore' | 'masteryScore'>) =>
      masteries.save({
        ...newMastery(ids.get(name) ?? -1, clock.now()),
        ...scores,
        dueAt: new Date('2026-10-20T09:00:00+09:00'),
      });
    await save('수익 인식', { gradedAttempts: 3, weaknessScore: 0.7, masteryScore: 0.3 });
    await save('계약 변경', { gradedAttempts: 3, weaknessScore: 0.6, masteryScore: 0.4 });
    await save('수행의무', { gradedAttempts: 1, weaknessScore: 0, masteryScore: 1 });
    await save('거래가격', { gradedAttempts: 4, weaknessScore: 0.1, masteryScore: 0.9 });

    const result = await client.callTool({ name: 'get_learning_context', arguments: { topic: '수익 인식' } });

    expect((result.structuredContent as { concepts: unknown }).concepts).toEqual([
      expect.objectContaining({
        name: '수익 인식',
        prerequisites: ['수행의무', '거래가격', '계약 식별'],
        mastery: 'WEAK',
        nextReview: '2026-10-20',
        weakPrerequisites: [
          { name: '계약 식별', level: 'UNSTUDIED', rootCauseOf: ['수익 인식', '계약 변경'] },
          { name: '수행의무', level: 'UNMEASURED', rootCauseOf: [] },
        ],
      }),
    ]);
    expect(JSON.stringify(result.content)).toContain(
      '/ 숙련도 약함, 다음 복습 2026-10-20 / 약한 선수 개념: 계약 식별(다룬 적 없음) 근본 원인 후보(기대는 약점 2개), 수행의무(미측정)',
    );
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
    // 연결한 개념은 복습 일정에 들어간다.
    expect(await testDb.count('concept_mastery')).toBe(1);
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

    await client.callTool({
      name: 'review_concept',
      arguments: { concept: '공간 인덱스', action: 'APPROVE', removeParent: true },
    });

    const removed = await client.callTool({ name: 'get_learning_context', arguments: { topic: '공간 인덱스' } });
    expect((removed.structuredContent as { concepts: unknown }).concepts).toContainEqual(
      expect.objectContaining({ name: '공간 인덱스', parent: null }),
    );
  });

  it('상위 개념을 지우면서 새 상위 개념을 주면 오류를 돌려준다', async () => {
    const result = await client.callTool({
      name: 'review_concept',
      arguments: { concept: '인덱스', action: 'APPROVE', parent: '인덱스 원리', removeParent: true },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('removeParent');
  });

  it('학습 기록이 붙은 개념도 병합하면 기록 연결과 복습 일정을 대상 개념으로 옮긴다', async () => {
    await testDb.db.insert(concept).values({
      trackId: (await testDb.db.select({ id: track.id }).from(track).where(eq(track.key, 'cs')))[0]?.id ?? -1,
      name: '인덱스 선택도',
      description: '선택도',
      status: 'ACTIVE',
      origin: 'INGESTION',
      autoApproved: true,
      createdAt: clock.now(),
      updatedAt: clock.now(),
    });
    await client.callTool({
      name: 'record_study_note',
      arguments: { topic: '선택도', summary: '요약', concepts: [{ name: '인덱스 선택도', signal: 'CONFUSED' }] },
    });

    const result = await client.callTool({
      name: 'review_concept',
      arguments: { concept: '인덱스 선택도', action: 'MERGE', into: '인덱스 원리' },
    });

    expect(JSON.stringify(result.content)).toContain('병합: 인덱스 선택도 → 인덱스 원리');
    const indexId = (await testDb.db.select().from(concept).where(eq(concept.name, '인덱스 원리')))[0]?.id;
    expect(await testDb.db.select().from(studyNoteConcept)).toEqual([
      { noteId: 1, conceptId: indexId, signal: 'CONFUSED' },
    ]);
    expect(await testDb.db.select({ conceptId: conceptMastery.conceptId }).from(conceptMastery)).toEqual([
      { conceptId: indexId },
    ]);
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
