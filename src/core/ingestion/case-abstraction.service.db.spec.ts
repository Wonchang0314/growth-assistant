import { asc } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { ConceptRepository } from '../knowledge/concept.repository.js';
import type { DecisionCaseBody } from '../memory/decision-case.js';
import { DecisionCaseRepository } from '../memory/decision-case.repository.js';
import { decisionCase, decisionCaseConcept } from '../memory/decision-case.schema.js';
import { ExperienceRepository } from '../memory/experience.repository.js';
import { experience } from '../memory/experience.schema.js';
import { SourceDocumentRepository } from '../memory/source-document.repository.js';
import type { HypotheticalVerification, Verification } from './case-abstraction.js';
import { CaseAbstractionService } from './case-abstraction.service.js';

const testDb = connectTestDb();
const clock = new FixedClock(new Date('2026-10-18T09:00:00Z'));
let claude: FakeClaudeClient;
let service: CaseAbstractionService;

const card = (title: string) => ({
  projectName: '사내 프로젝트',
  title,
  situation: '상황',
  task: '과제',
  action: '행동',
  result: '결과',
  lesson: '교훈',
  occurredAt: null,
});

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 0.2, description: 'DB' }],
      concepts: [{ name: '인덱스', track: 'database', aliases: [], description: '인덱스', requires: [], related: [] }],
    },
    clock.now(),
  );
  const documents = new SourceDocumentRepository(testDb.db);
  await documents.save(
    'NOTION',
    { externalId: 'a', title: '문서', url: 'https://notion.so/a', updatedAt: clock.now(), chunks: ['본문'] },
    clock.now(),
  );
  // 테이블을 비울 때 ID를 1부터 다시 시작하므로 문서와 개념은 모두 1번이다.
  const conceptId = 1;
  await new ExperienceRepository(testDb.db).saveExtraction({
    documentId: 1,
    summary: '요약',
    cards: [
      { ...card('설정만 바꿈'), concepts: [] },
      { ...card('부분 인덱스와 전체 인덱스 중 고름'), concepts: [conceptId] },
      { ...card('문서 정리'), concepts: [] },
    ],
    newConcepts: [],
    aliasAdds: [],
    now: clock.now(),
  });
  claude = new FakeClaudeClient();
  service = new CaseAbstractionService(claude, new DecisionCaseRepository(testDb.db), clock);
});
afterAll(() => testDb.close());

const body = (situation = '주문 테이블 조회가 느리다'): DecisionCaseBody => ({
  situation,
  constraints: ['쓰기가 많다'],
  options: [
    { text: '부분 인덱스', chosen: true, reason: '조회 조건이 고정' },
    { text: '전체 인덱스', chosen: false, reason: '쓰기 비용' },
  ],
  decision: '부분 인덱스를 만든다',
  rationale: '조건에 맞는 행만 색인해 쓰기 비용을 줄인다',
  outcome: '조회가 빨라졌다',
  invariants: ['조회는 항상 같은 조건으로 걸러진다'],
});
const verified = (overrides: Partial<Verification> = {}): string =>
  JSON.stringify({
    sameConclusion: true,
    invariantsKept: true,
    selfContained: true,
    leakedNames: [],
    problems: [],
    ...overrides,
  });
const solved = (overrides: Partial<HypotheticalVerification> = {}): string =>
  JSON.stringify({ answer: 1, singleAnswer: true, selfContained: true, leakedNames: [], problems: [], ...overrides });
const cases = () => testDb.db.select().from(decisionCase).orderBy(asc(decisionCase.id));

describe('CaseAbstractionService', () => {
  it('판단이 분명한 카드만 골라 추상화하고, 게이트와 검증을 통과하면 ACTIVE로 카드의 개념과 함께 저장한다', async () => {
    claude
      .reply(
        JSON.stringify({
          cards: [
            { id: 1, hasDecision: false },
            { id: 2, hasDecision: true },
            { id: 3, hasDecision: false },
          ],
        }),
      )
      .reply(JSON.stringify(body()))
      .reply(verified());

    const report = await service.run({ limit: 10 });

    expect(report).toEqual({
      screened: 3,
      decisions: 1,
      experience: 1,
      hypothetical: 0,
      pending: 0,
      failed: [],
      stopped: null,
    });
    expect(claude.requests.map((r) => r.purpose)).toEqual(['CASE_SCREENING', 'CASE_ABSTRACTION', 'CASE_VERIFICATION']);
    expect(claude.requestsFor('CASE_SCREENING')[0]?.prompt).toContain('## id 3');
    expect(claude.requestsFor('CASE_VERIFICATION')[0]?.prompt).toContain('사내 프로젝트');
    expect(await cases()).toEqual([
      expect.objectContaining({
        experienceId: 2,
        kind: 'EXPERIENCE',
        status: 'ACTIVE',
        reviewNote: null,
        decision: '부분 인덱스를 만든다',
      }),
    ]);
    expect(await testDb.db.select().from(decisionCaseConcept)).toEqual([{ caseId: 1, conceptId: 1 }]);
    expect((await testDb.db.select().from(experience).orderBy(asc(experience.id))).map((e) => e.caseScreen)).toEqual([
      'NO_DECISION',
      'DECISION',
      'NO_DECISION',
    ]);

    const again = await service.run({ limit: 10 });
    expect(again).toMatchObject({ screened: 0, decisions: 0 });
  });

  it('경험 사례가 게이트에 걸리면 걸린 문자열을, 검증에 걸리면 그 문제를 붙여 다시 쓰고, 끝내 걸리면 가정 사례로 넘어간다', async () => {
    claude
      .reply(JSON.stringify(body('CUSTOMER_EXT 테이블 조회가 느리다')))
      .reply(JSON.stringify(body()))
      .reply(verified({ invariantsKept: false, problems: ['쓰기 비율 조건이 빠졌다'] }))
      .reply(JSON.stringify(body('게시글 테이블 조회가 느리다')))
      .reply(solved());

    const report = await service.run({ ids: [2] });

    expect(report).toMatchObject({ screened: 0, experience: 0, hypothetical: 1, pending: 0 });
    expect(claude.requestsFor('CASE_ABSTRACTION')[1]?.prompt).toContain('CUSTOMER_EXT');
    expect(claude.requestsFor('CASE_HYPOTHETICAL')[0]?.prompt).toContain('쓰기 비율 조건이 빠졌다');
    // 정답을 숨긴다: 선택지 문장만 보내고 고른 표시·이유·결정·근거는 보내지 않는다.
    const question = claude.requestsFor('CASE_HYPOTHETICAL_VERIFICATION')[0]?.prompt;
    expect(question).toContain('1. 부분 인덱스');
    expect(question).not.toMatch(/chosen|조회 조건이 고정|부분 인덱스를 만든다|쓰기 비용을 줄인다/);
    expect(await cases()).toEqual([
      expect.objectContaining({
        experienceId: 2,
        kind: 'HYPOTHETICAL',
        status: 'ACTIVE',
        reviewNote: null,
        situation: '게시글 테이블 조회가 느리다',
      }),
    ]);
  });

  it('가정 사례 검증이 다른 번호를 고르면 그 이유를 붙여 다시 쓰고, 그것도 걸리면 마지막 경험 사례를 두 쪽 사유와 PENDING으로 둔다', async () => {
    const rejected = verified({ sameConclusion: false, problems: ['버린 선택지의 근거가 카드에 없다'] });
    claude
      .reply(JSON.stringify(body('첫 경험 사례')))
      .reply(rejected)
      .reply(JSON.stringify(body('둘째 경험 사례')))
      .reply(rejected)
      .reply(JSON.stringify(body('첫 가정 사례')))
      .reply(solved({ answer: 2 }))
      .reply(JSON.stringify(body('둘째 가정 사례')))
      .reply(solved({ singleAnswer: false, problems: ['2번도 맞다: 제약에 쓰기 비율이 없다'] }));

    const report = await service.run({ ids: [2] });

    expect(report).toMatchObject({ experience: 0, hypothetical: 0, pending: 1 });
    expect(claude.requestsFor('CASE_HYPOTHETICAL')[1]?.prompt).toContain('검토자가 2번을 골랐다(사례의 정답은 1번)');
    expect(await cases()).toEqual([
      expect.objectContaining({
        kind: 'EXPERIENCE',
        status: 'PENDING',
        situation: '둘째 경험 사례',
        reviewNote: [
          '경험 사례:',
          '- 버린 선택지의 근거가 카드에 없다',
          '가정 사례:',
          '- 2번도 맞다: 제약에 쓰기 비율이 없다',
        ].join('\n'),
      }),
    ]);
  });

  it('검증이 남은 이름을 찾으면 다시 쓰게 하고, 다시 통과하면 ACTIVE로 바꿔 저장한다', async () => {
    claude
      .reply(JSON.stringify(body('사내 프로젝트의 주문 테이블')))
      .reply(verified({ leakedNames: ['사내 프로젝트'] }))
      .reply(JSON.stringify(body()))
      .reply(verified());

    await service.run({ ids: [2] });

    expect(claude.requestsFor('CASE_ABSTRACTION')[1]?.prompt).toContain('남은 이름: 사내 프로젝트');
    expect(await cases()).toEqual([
      expect.objectContaining({ status: 'ACTIVE', situation: '주문 테이블 조회가 느리다' }),
    ]);
  });

  it('사용량 한도에 걸리면 남은 카드를 두고 멈추고, 다른 오류는 그 카드만 실패로 남긴다', async () => {
    claude.fail('INVALID_OUTPUT', '형식 오류').fail('RATE_LIMIT', '한도');

    const report = await service.run({ ids: [1, 2, 3] });

    expect(report).toMatchObject({ experience: 0, pending: 0, stopped: 'RATE_LIMIT: 한도' });
    expect(report.failed).toEqual([{ title: '설정만 바꿈', error: '형식 오류' }]);
    expect(await cases()).toEqual([]);
  });
});
