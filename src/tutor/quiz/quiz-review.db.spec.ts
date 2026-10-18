import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { FakeClaudeClient } from '../../../test/fakes/fake-claude.client.js';
import { FixedClock } from '../../../test/fakes/fixed-clock.js';
import { fillBlankReply, solvedReply } from '../../../test/fixtures/quiz.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import { ConceptService } from '../../core/knowledge/concept.service.js';
import { ExperienceRepository } from '../../core/memory/experience.repository.js';
import { AppSettingRepository } from '../../core/setting/app-setting.repository.js';
import { MasteryRepository } from '../mastery/mastery.repository.js';
import { MasteryService } from '../mastery/mastery.service.js';
import { StudyNoteRepository } from '../study/study-note.repository.js';
import { StudyNoteService } from '../study/study-note.service.js';
import { QuizGenerationService } from './application/quiz-generation.service.js';
import { QuizGradingService } from './application/quiz-grading.service.js';
import { QuizGuidelineService } from './application/quiz-guideline.service.js';
import { QuizReviewService } from './application/quiz-review.service.js';
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
const grading = new QuizGradingService(questions, attempts, mastery, experiences, clock);
let claude: FakeClaudeClient;
let review: QuizReviewService;

/** 검증을 통과한 객관식 문제. 정답은 1번 "선택도가 낮아서"다. */
const addQuestion = (conceptId: number, keyPoint = `핵심 ${conceptId}`) =>
  questions.add({
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
    validationStatus: 'VALID',
    validationNote: null,
    createdAt: clock.now(),
  });

const submit = (questionId: number, answer: string, confidence: 'SURE' | 'UNSURE' | 'GUESS' = 'SURE') => {
  clock.advance(60_000);
  return grading.submit({ questionId, answer, confidence, hintUsed: false });
};

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 1, description: 'DB' }],
      // 트랜잭션(2)을 알려면 인덱스(1)를 먼저 알아야 한다.
      concepts: [
        { name: '인덱스', requires: [] },
        { name: '트랜잭션', requires: ['인덱스'] },
      ].map((c) => ({ ...c, track: 'database', aliases: [], description: c.name, related: [] })),
    },
    clock.now(),
  );
  claude = new FakeClaudeClient();
  const generation = new QuizGenerationService(
    new ClaudeQuestionGenerator(claude),
    questions,
    concepts,
    experiences,
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
    claude.reply(fillBlankReply).reply(solvedReply({ answer: '선택도' }));

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
      remainingToday: null,
    });
    // 객관식이 이미 있어 빈칸을 만들었다.
    expect(second.kind === 'READY' && second.questions.map((q) => [q.questionId, q.type])).toEqual([
      [1, 'MULTIPLE_CHOICE'],
      [2, 'FILL_BLANK'],
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

  it('오늘 10문제를 풀었으면 더 내지 않는다', async () => {
    const id = await addQuestion(1);
    for (let i = 0; i < 10; i++) await submit(id, '1');

    expect(await review.reviewSet({})).toEqual({ kind: 'DAILY_LIMIT_REACHED' });
    // 다음 날이면 다시 낸다.
    clock.advance(DAY);
    expect(await review.reviewSet({})).toMatchObject({ kind: 'READY' });
    await review.idle();
  });

  it('없는 개념이면 알려 준다', async () => {
    expect(await review.reviewSet({ concept: '쿠버네티스' })).toEqual({ kind: 'UNKNOWN_CONCEPT', name: '쿠버네티스' });
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
  it('트랙별 약점 개념과 반복한 오개념, 선수 개념에서 찾은 근본 원인 후보, 미측정 수를 돌려준다', async () => {
    const id = await addQuestion(2);
    await submit(id, '2');
    await submit(id, '2');

    const report = await new QuizWeaknessService(mastery, concepts, attempts, clock).report();

    expect(report).toMatchObject({
      tracks: [
        {
          track: '관계형 DB',
          concepts: [{ name: '트랜잭션', repeatedMisconceptions: ['짧으면 안 된다고 믿음'] }],
        },
      ],
      rootCauses: [{ concept: { name: '인덱스' }, level: 'UNSTUDIED', dependents: [{ name: '트랜잭션' }] }],
      unmeasured: 0,
    });
  });

  it('근본 원인 후보를 복습 맨 앞에 내고, 오늘 푼 뒤에는 다시 앞에 두지 않는다', async () => {
    const weak = await addQuestion(2);
    await submit(weak, '2');
    await submit(weak, '2');
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
