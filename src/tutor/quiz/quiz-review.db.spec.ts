import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { multipleChoiceReply, solvedReply, variantCheckReply } from '../../../test/fixtures/quiz.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import { ConceptService } from '../../core/knowledge/concept.service.js';
import { DecisionCaseRepository } from '../../core/memory/decision-case.repository.js';
import { ExperienceRepository } from '../../core/memory/experience.repository.js';
import { SourceDocumentRepository } from '../../core/memory/source-document.repository.js';
import { AppSettingRepository } from '../../core/setting/app-setting.repository.js';
import { MasteryRepository } from '../mastery/mastery.repository.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { StudyNoteRepository } from '../study/study-note.repository.js';
import { StudyNoteService } from '../study/study-note.service.js';
import { QuizGenerationService } from './application/quiz-generation.service.js';
import { QuizGradingService } from './application/quiz-grading.service.js';
import { QuizGuidelineService } from './application/quiz-guideline.service.js';
import { QuizReviewService, RETRY_AFTER_MS } from './application/quiz-review.service.js';
import { QuizWeaknessService } from './application/quiz-weakness.service.js';
import { ClaudeQuestionGenerator } from './infrastructure/claude-question.generator.js';
import { DrizzleQuizAttemptRepository } from './infrastructure/drizzle-quiz-attempt.repository.js';
import { DrizzleQuizQuestionRepository } from './infrastructure/drizzle-quiz-question.repository.js';
import { quizAttempt } from './infrastructure/quiz-attempt.schema.js';
import { quizQuestion } from './infrastructure/quiz-question.schema.js';

const testDb = connectTestDb();
const DAY = 24 * 60 * 60 * 1000;
const clock = new FixedClock(new Date('2026-10-18T09:00:00Z'));
const concepts = new ConceptService(new ConceptRepository(testDb.db));
const experiences = new ExperienceRepository(testDb.db);
const mastery = new MasteryService(new MasteryRepository(testDb.db));
const studyNotes = new StudyNoteService(new StudyNoteRepository(testDb.db), experiences, concepts, mastery, clock);
const questions = new DrizzleQuizQuestionRepository(testDb.db);
const attempts = new DrizzleQuizAttemptRepository(testDb.db);
const cases = new DecisionCaseRepository(testDb.db);
const grading = new QuizGradingService(questions, attempts, mastery, experiences, cases, clock);
let claude: FakeClaudeClient;
let review: QuizReviewService;

/** 검증을 통과한 객관식 문제. 정답은 1번 "선택도가 낮아서"다. */
const addQuestion = (conceptId: number, keyPoint = `핵심 ${conceptId}`, variantOf: number | null = null) => {
  clock.advance(1000);
  return questions.add({
    conceptId,
    type: 'MULTIPLE_CHOICE',
    angle: 'WHY',
    keyPoint,
    difficulty: 1,
    prompt: `개념 ${conceptId} 질문`,
    choices: [
      { text: '선택도가 낮아서', misconception: null },
      { text: '컬럼이 짧아서', misconception: '짧으면 안 된다고 믿음' },
    ],
    answer: '선택도가 낮아서',
    explanation: '해설',
    referenceMaterial: '근거',
    experienceId: null,
    variantOf,
    caseId: null,
    validationStatus: 'VALID',
    validationNote: null,
    createdAt: clock.now(),
  });
};

const submit = (questionId: number, answer: string, confidence: 'SURE' | 'UNSURE' | 'GUESS' = 'SURE') => {
  clock.advance(60_000);
  return grading.submit({ questionId, answer, confidence, hintUsed: false });
};

// 트랜잭션(2)을 알려면 인덱스(1)를 먼저 알아야 한다.
const BASE_CONCEPTS = [
  { name: '인덱스', requires: [] },
  { name: '트랜잭션', requires: ['인덱스'] },
];
const seedConcepts = (list: readonly { name: string; requires: string[] }[]) =>
  list.map((c) => ({ ...c, track: 'database', aliases: [], description: c.name, related: [] }));
/** 근본 원인은 약점 둘 이상이 기대야 하므로(ADR-0033), 인덱스를 먼저 알아야 하는 격리 수준을 더하고 그 id를 돌려준다. */
async function addIsolationLevel(): Promise<number> {
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 1, description: 'DB' }],
      concepts: seedConcepts([...BASE_CONCEPTS, { name: '격리 수준', requires: ['인덱스'] }]),
    },
    clock.now(),
  );
  const { resolved } = await concepts.resolve(['격리 수준']);
  if (!resolved[0]) throw new Error('격리 수준 개념이 없다');
  return resolved[0].id;
}

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 1, description: 'DB' }],
      concepts: seedConcepts(BASE_CONCEPTS),
    },
    clock.now(),
  );
  claude = new FakeClaudeClient();
  const generation = new QuizGenerationService(
    new ClaudeQuestionGenerator(claude),
    questions,
    concepts,
    experiences,
    mastery,
    studyNotes,
    new QuizGuidelineService(new AppSettingRepository(testDb.db)),
    clock,
    () => 0,
  );
  review = new QuizReviewService(
    questions,
    attempts,
    generation,
    concepts,
    mastery,
    studyNotes,
    new QuizWeaknessService(mastery, concepts, attempts, clock),
    clock,
    () => 0.5,
  );
});
afterAll(() => testDb.close());

describe('get_review_set', () => {
  it('개념을 고르면 풀지 않은 문제를 정답 없이 내고, 모자라면 뒤에서 만들어 다음에 낸다', async () => {
    await addQuestion(1);
    claude.reply(multipleChoiceReply()).reply(solvedReply({ choice: 1 }));

    const first = await review.reviewSet({ concept: '인덱스', count: 2 });
    await review.idle();
    const second = await review.reviewSet({ concept: '인덱스', count: 2 });

    expect(first).toEqual({
      kind: 'READY',
      questions: [
        {
          questionId: 1,
          concept: '인덱스',
          type: 'MULTIPLE_CHOICE',
          prompt: '개념 1 질문',
          choices: ['선택도가 낮아서', '컬럼이 짧아서'],
        },
      ],
      preparing: ['인덱스'],
      failed: [],
      remainingToday: null,
    });
    // 빈칸은 복습에서 빼서(ENABLED_TYPES) 객관식이 이미 있어도 객관식을 만든다.
    expect(second.kind === 'READY' && second.questions.map((q) => [q.questionId, q.type])).toEqual([
      [1, 'MULTIPLE_CHOICE'],
      [2, 'MULTIPLE_CHOICE'],
    ]);
    expect((await testDb.db.select().from(quizQuestion)).map((q) => q.usedCount)).toEqual([2, 1]);
  });

  it('고르지 않으면 복습할 때가 된 개념, 새 개념 순으로 개념마다 한 문제씩 내고, 푼 개념은 다음 복습일까지 빠진다', async () => {
    await addQuestion(1);
    await addQuestion(2);
    await mastery.introduce([2], clock.now());

    const set = await review.reviewSet({});
    await submit(1, '1');
    const after = await review.reviewSet({});

    expect(set.kind === 'READY' && set.questions.map((q) => q.concept)).toEqual(['트랜잭션', '인덱스']);
    expect(set).toMatchObject({ remainingToday: 10 });
    expect(after.kind === 'READY' && after.questions.map((q) => q.concept)).toEqual(['트랜잭션']);
    expect(after).toMatchObject({ preparing: [], remainingToday: 9 });
  });

  it('오늘(Asia/Seoul) 늦게 때가 되는 개념도 지금 내고, 내일 때가 되는 개념은 내지 않아 오늘 복습 알림과 같은 개념을 센다', async () => {
    // 시계는 18:00(Asia/Seoul)이다. 인덱스는 23:00, 트랜잭션은 다음 날 때가 된다.
    await mastery.introduce([1], new Date(clock.now().getTime() + 5 * 60 * 60_000));
    await mastery.introduce([2], new Date(clock.now().getTime() + DAY));
    await addQuestion(1);
    await addQuestion(2);

    const set = await review.reviewSet({});

    expect(set.kind === 'READY' && set.questions.map((q) => q.concept)).toEqual(['인덱스']);
    expect(await review.today()).toEqual({ answered: 0, conceptIds: [1] });
  });

  it('오늘 10문제를 풀었으면 더 내지 않는다', async () => {
    const id = await addQuestion(1);
    for (let i = 0; i < 10; i++) await submit(id, '1');

    expect(await review.reviewSet({})).toEqual({ kind: 'DAILY_LIMIT_REACHED' });
    // 다음 날이면 다시 낸다.
    clock.advance(DAY);
    expect(await review.reviewSet({})).toMatchObject({ kind: 'READY' });
    await review.idle();
  });

  it('더 풀기는 하루 상한을 넘어 같은 우선순위로 내되, 오늘 푼 개념은 낼 문제가 남아 있어도 뺀다', async () => {
    const isolation = await addIsolationLevel();
    const solved = await addQuestion(1);
    for (let i = 0; i < 10; i++) await submit(solved, '2');
    await addQuestion(1, '다른 핵심');
    await addQuestion(2);
    await addQuestion(isolation);
    await mastery.introduce([isolation], clock.now());

    const more = await review.reviewSet({ more: true });

    expect(await review.reviewSet({})).toEqual({ kind: 'DAILY_LIMIT_REACHED' });
    expect(more).toMatchObject({ kind: 'READY', remainingToday: null });
    // 격리 수준은 복습할 때가 되어 새 개념인 트랜잭션보다 앞이다. 인덱스는 약점이지만 오늘 풀었다.
    expect(more.kind === 'READY' && more.questions.map((q) => q.concept)).toEqual(['격리 수준', '트랜잭션']);
    expect(await review.today()).toEqual({ answered: 10, conceptIds: [] });
  });

  it('없는 개념이면 알려 준다', async () => {
    expect(await review.reviewSet({ concept: '쿠버네티스' })).toEqual({ kind: 'UNKNOWN_CONCEPT', name: '쿠버네티스' });
  });
});

describe('오늘 복습 (새벽 문제 만들기, 학습 알림)', () => {
  it('오늘 안에 때가 되는 개념을 고르고 내일 개념과 새 개념은 넣지 않으며, 오늘 푼 수를 함께 준다', async () => {
    await mastery.introduce([1], new Date(clock.now().getTime() + 60_000));
    await mastery.introduce([2], new Date(clock.now().getTime() + DAY));

    const before = await review.today();
    await submit(await addQuestion(1), '1');

    expect(before).toEqual({ answered: 0, conceptIds: [1] });
    expect(await review.today()).toMatchObject({ answered: 1 });
  });

  it('낼 문제가 없는 개념만 상한까지 하나씩 만든다', async () => {
    await mastery.introduce([1, 2, await addIsolationLevel()], clock.now());
    await addQuestion(1);
    claude.reply(multipleChoiceReply()).reply(solvedReply({ choice: 1 }));

    const result = await review.prepareToday(1);

    expect(result).toEqual({ concepts: 1, ready: 1 });
    expect(claude.requestsFor('QUIZ_GENERATION')).toHaveLength(1);
    expect(await questions.findServable(2, 1)).toHaveLength(1);
  });
});

describe('submit_answer', () => {
  it('채점해 풀이를 남기고 숙련도와 다음 복습일을 갱신한다', async () => {
    const id = await addQuestion(1);

    const result = await submit(id, '1');

    expect(result).toMatchObject({
      kind: 'GRADED',
      correct: true,
      correctAnswer: '1. 선택도가 낮아서',
      misconception: null,
      mastery: { conceptId: 1, masteryScore: 1, gradedAttempts: 1, state: 'REVIEW' },
    });
    expect(await testDb.db.select().from(quizAttempt)).toEqual([
      expect.objectContaining({ questionId: id, userAnswer: '선택도가 낮아서', isCorrect: true, confidence: 'SURE' }),
    ]);
  });

  it('같은 오개념을 다시 고르면 반복 오개념으로 약점에 가산한다', async () => {
    const id = await addQuestion(1);
    await submit(id, '1');
    const once = await submit(id, '2', 'UNSURE');
    const twice = await submit(id, '2', 'UNSURE');

    expect(once).toMatchObject({ misconception: '짧으면 안 된다고 믿음' });
    expect(once.kind === 'GRADED' && once.mastery?.weaknessScore).toBeCloseTo(0.4);
    // 0.4 × (1 + 반복 가산 0.5) + 0.6 × 0.4
    expect(twice.kind === 'GRADED' && twice.mastery?.weaknessScore).toBeCloseTo(0.84);
  });

  it('보기를 알 수 없는 답은 채점하지 않는다', async () => {
    const id = await addQuestion(1);

    expect(await submit(id, '5')).toMatchObject({ kind: 'UNREADABLE_ANSWER' });
    expect(await testDb.count('quiz_attempt')).toBe(0);
  });
});

describe('변형 문제', () => {
  // 원래 문제(addQuestion)와 보기·정답이 달라야 변형의 모양 검사를 통과한다.
  const variantReply = multipleChoiceReply({
    choices: [
      { text: '걸러지는 행이 적어서', misconception: null },
      { text: '인덱스가 메모리에 없어서', misconception: '인덱스는 메모리에 있어야만 쓰인다고 믿음' },
      { text: '통계가 오래돼서', misconception: '통계만 고치면 늘 인덱스를 탄다고 믿음' },
      { text: '컬럼이 문자열이라서', misconception: '문자열 컬럼은 인덱스를 못 탄다고 믿음' },
    ],
    answer: '걸러지는 행이 적어서',
  });

  it('틀린 문제는 뒤에서 그 변형(같은 핵심, 원래 문제 연결)을 만들고, 그때의 오답과 오개념을 출제에 넣는다', async () => {
    const original = await addQuestion(1);
    await submit(original, '2');
    claude
      .reply(variantReply)
      .reply(solvedReply({ choice: 1 }))
      .reply(variantCheckReply());

    await review.reviewSet({ concept: '인덱스', count: 1 });
    await review.idle();

    const variant = (await questions.findHistory(1)).at(-1)?.question;
    expect(variant).toMatchObject({ type: 'MULTIPLE_CHOICE', variantOf: original, keyPoint: '핵심 1' });
    const prompt = claude.requestsFor('QUIZ_GENERATION')[0]?.prompt ?? '';
    expect(prompt).toContain('## 변형할 원래 문제');
    expect(prompt).toContain('그때 고른 오개념: 짧으면 안 된다고 믿음');
    expect(prompt).not.toContain('이미 낸 핵심');
    expect(claude.requestsFor('QUIZ_VERIFICATION')).toHaveLength(2);
  });

  it('원래 답을 외워서 풀 수 있다고 두 번 걸리면 INVALID로 남기고 다음에 다시 만든다', async () => {
    const original = await addQuestion(1);
    await submit(original, '2');
    const memorizable = variantCheckReply({ solvableByMemory: true });
    claude
      .reply(variantReply)
      .reply(solvedReply({ choice: 1 }))
      .reply(memorizable)
      .reply(variantReply)
      .reply(solvedReply({ choice: 1 }))
      .reply(memorizable);

    await review.reviewSet({ concept: '인덱스', count: 1 });
    await review.idle();

    expect(await testDb.db.select().from(quizQuestion)).toContainEqual(
      expect.objectContaining({
        variantOf: original,
        validationStatus: 'INVALID',
        validationNote: '원래 문제의 답을 기억하면 그대로 풀 수 있다',
      }),
    );
    expect((await questions.findHistory(1)).map((h) => h.hasVariant)).toEqual([false]);
  });

  it('낼 문제 중 변형을 먼저 낸다', async () => {
    const original = await addQuestion(1);
    const unanswered = await addQuestion(1, '다른 핵심');
    await submit(original, '2');
    const variant = await addQuestion(1, '핵심 1', original);

    const set = await review.reviewSet({ concept: '인덱스', count: 2 });

    expect(set.kind === 'READY' && set.questions.map((q) => q.questionId)).toEqual([variant, unanswered]);
  });
});

describe('경험과 판단 사례 (ADR-0038)', () => {
  const body = {
    situation: '배포 중 구버전 앱이 함께 떠 있는 서비스에서 컬럼 이름을 바꿔야 한다',
    constraints: ['다운타임 불가'],
    options: [
      { text: '새 컬럼을 추가하고 양쪽에 쓴다', chosen: true, reason: '구버전이 깨지지 않는다' },
      { text: '컬럼 이름을 바로 바꾼다', chosen: false, reason: '구버전이 깨진다' },
    ],
    decision: '확장 후 축소',
    rationale: '호환 기간을 둔다',
    outcome: '무중단',
    invariants: ['구버전과 신버전이 동시에 돈다'],
  };

  /** 인덱스(1)에 이은 경험 카드 둘과 판단 사례: 사례 1은 경험 사례(카드 1), 사례 2는 가정 사례(카드 2). */
  async function seedCases() {
    const documents = new SourceDocumentRepository(testDb.db);
    await documents.save(
      'NOTION',
      { externalId: 'a', title: '문서', url: 'https://notion.so/a', updatedAt: clock.now(), chunks: ['본문'] },
      clock.now(),
    );
    const card = (title: string) => ({
      projectName: null,
      title,
      situation: '상황',
      task: '과제',
      action: '행동',
      result: '결과',
      lesson: '교훈',
      occurredAt: null,
      concepts: [1],
    });
    await experiences.saveExtraction({
      documentId: 1,
      summary: '요약',
      cards: [card('운영 중 컬럼 이름 변경'), card('구버전 호환 배포')],
      newConcepts: [],
      aliasAdds: [],
      now: clock.now(),
    });
    for (const [experienceId, kind] of [
      [1, 'EXPERIENCE'],
      [2, 'HYPOTHETICAL'],
    ] as const) {
      await cases.save({ experienceId, kind, body, status: 'ACTIVE', reviewNote: null, now: clock.now() });
    }
  }

  it('승인된 판단 사례가 있어도 개념 문제만 만들고, 사례·경험 카드는 출제에 싣지 않는다', async () => {
    await seedCases();
    claude.reply(multipleChoiceReply()).reply(solvedReply({ choice: 1 }));

    await review.reviewSet({ concept: '인덱스', count: 1 });
    await review.idle();

    const [question] = await testDb.db.select().from(quizQuestion);
    expect(question).toMatchObject({ angle: 'MECHANISM', caseId: null });
    const prompt = claude.requestsFor('QUIZ_GENERATION')[0]?.prompt ?? '';
    expect(prompt).not.toMatch(/판단 사례|구버전|컬럼 이름|운영 중 컬럼 이름 변경|구버전 호환 배포/);
  });

  it('문제에 그 개념의 경험 카드를 잇고, 채점 결과에서는 "같은 개념을 다룬 경험"으로 보여 준다', async () => {
    await seedCases();
    claude.reply(multipleChoiceReply()).reply(solvedReply({ choice: 1 }));

    await review.reviewSet({ concept: '인덱스', count: 1 });
    await review.idle();
    const [made] = await testDb.db.select().from(quizQuestion);
    const graded = await submit(made?.id ?? 0, '1');

    // 두 카드 모두 날짜가 없어 나중에 저장한 카드(2)가 먼저다.
    expect(made?.experienceId).toBe(2);
    expect(graded).toMatchObject({ experience: { title: '구버전 호환 배포', relation: 'SAME_CONCEPT' } });
  });
});

describe('개념 병합', () => {
  it('문제를 대상 개념으로 옮기고, 풀이는 문제를 따라간다', async () => {
    const id = await addQuestion(1);
    await submit(id, '1');

    await testDb.db.transaction((tx) => questions.moveConcept(tx, 1, 2));

    expect(await questions.find(id)).toMatchObject({ conceptId: 2 });
    expect(await attempts.findForConcept(2)).toHaveLength(1);
  });
});

describe('get_weakness', () => {
  it('트랙별 약점 개념과 반복한 오개념, 약점 둘 이상이 기대는 근본 원인 후보, 미측정 수를 돌려준다', async () => {
    const isolation = await addIsolationLevel();
    for (const conceptId of [2, isolation]) {
      const id = await addQuestion(conceptId);
      await submit(id, '2');
      await submit(id, '2');
    }

    const report = await new QuizWeaknessService(mastery, concepts, attempts, clock).report();

    expect(report).toMatchObject({
      tracks: [
        {
          track: '관계형 DB',
          concepts: [
            { name: '트랜잭션', repeatedMisconceptions: ['짧으면 안 된다고 믿음'] },
            { name: '격리 수준', repeatedMisconceptions: ['짧으면 안 된다고 믿음'] },
          ],
        },
      ],
      rootCauses: [
        { concept: { name: '인덱스' }, level: 'UNSTUDIED', dependents: [{ name: '트랜잭션' }, { name: '격리 수준' }] },
      ],
      unmeasured: 0,
    });
  });

  it('뒤에서 만든 문제가 모두 검증에 걸리면 그 개념은 잠시 다시 만들지 않고 만들지 못했다고 알린다', async () => {
    // 풀이 비어 있으면 객관식부터 만든다.
    const rejected = solvedReply({ choice: 1, singleAnswer: false, problems: ['정답이 둘이다'] });
    claude.reply(multipleChoiceReply()).reply(rejected).reply(multipleChoiceReply()).reply(rejected);

    await review.reviewSet({ concept: '인덱스', count: 1 });
    await review.idle();
    const soon = await review.reviewSet({ concept: '인덱스', count: 1 });
    await review.idle();
    // 30분 안에는 다시 만들지 않아, 만들기 한 번(쓰기·검증 두 번씩)만 불렀다.
    expect(claude.requests).toHaveLength(4);

    clock.advance(RETRY_AFTER_MS);
    claude.reply(multipleChoiceReply()).reply(solvedReply({ choice: 1 }));
    const later = await review.reviewSet({ concept: '인덱스', count: 1 });
    await review.idle();
    const ready = await review.reviewSet({ concept: '인덱스', count: 1 });

    expect(soon).toMatchObject({ questions: [], preparing: [], failed: ['인덱스'] });
    expect(later).toMatchObject({ preparing: ['인덱스'], failed: [] });
    expect(ready).toMatchObject({ failed: [] });
    expect(ready.kind === 'READY' && ready.questions).toHaveLength(1);
  });

  it('근본 원인 후보를 복습 맨 앞에 내고, 오늘 푼 뒤에는 다시 앞에 두지 않는다', async () => {
    const isolation = await addIsolationLevel();
    for (const conceptId of [2, isolation]) {
      const weak = await addQuestion(conceptId);
      await submit(weak, '2');
      await submit(weak, '2');
    }
    const cause = await addQuestion(1);

    const first = await review.reviewSet({ count: 1 });
    await submit(cause, '1');
    const second = await review.reviewSet({ count: 1 });
    await review.idle();

    expect(first.kind === 'READY' && first.questions.map((q) => q.concept)).toEqual(['인덱스']);
    expect(second.kind === 'READY' && second.preparing).toEqual(['트랜잭션']);
  });
});

describe('report_question', () => {
  it('신고하면 다시 내지 않고, 그 풀이를 뺀 기록으로 숙련도를 다시 계산하며, 그 뒤 풀이는 숙련도에 넣지 않는다', async () => {
    const good = await addQuestion(1);
    const bad = await addQuestion(1, '이상한 문제');
    await submit(good, '1');
    await submit(bad, '2');

    await grading.report(bad, '2번도 맞다');
    const set = await review.reviewSet({ concept: '인덱스' });
    await review.idle();
    const late = await submit(bad, '2');

    expect(await mastery.find(1)).toMatchObject({ gradedAttempts: 1, masteryScore: 1, weaknessScore: 0 });
    expect(set.kind === 'READY' && set.questions).toEqual([]);
    expect(late).toMatchObject({ kind: 'GRADED', mastery: null });
    expect((await testDb.db.select().from(quizQuestion)).find((q) => q.id === bad)).toMatchObject({
      reported: true,
      reportReason: '2번도 맞다',
    });
  });
});
