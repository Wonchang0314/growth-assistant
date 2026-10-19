import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { asc, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { connectTestDb } from '../../../test/db/test-db.js';
import { MIGRATIONS_FOLDER } from '../../core/db/db.module.js';
import { ConceptRepository } from '../../core/knowledge/concept.repository.js';
import type { NewQuestion } from './application/ports.js';
import { DrizzleQuizAttemptRepository } from './infrastructure/drizzle-quiz-attempt.repository.js';
import { DrizzleQuizQuestionRepository } from './infrastructure/drizzle-quiz-question.repository.js';
import { quizQuestion } from './infrastructure/quiz-question.schema.js';

const testDb = connectTestDb();
const questions = new DrizzleQuizQuestionRepository(testDb.db);
const attempts = new DrizzleQuizAttemptRepository(testDb.db);
const now = new Date('2026-10-20T00:00:00Z');

/** 0013 마이그레이션의 SQL. 테스트 DB에는 이미 적용됐으므로, 옛 문제를 넣은 뒤 다시 돌려 효과를 본다. */
const migration = readFileSync(join(MIGRATIONS_FOLDER, '0013_concept_only_quiz.sql'), 'utf8').split(
  '--> statement-breakpoint',
);

const add = (overrides: Partial<Extract<NewQuestion, { type: 'MULTIPLE_CHOICE' }>> = {}) =>
  questions.add({
    conceptId: 1,
    type: 'MULTIPLE_CHOICE',
    angle: 'WHY',
    keyPoint: '핵심',
    difficulty: 1,
    prompt: '성별 컬럼 인덱스가 느린 이유는?',
    choices: [
      { text: '선택도가 낮아서', misconception: null },
      { text: '컬럼이 짧아서', misconception: '믿음' },
    ],
    answer: '선택도가 낮아서',
    explanation: '해설',
    referenceMaterial: '근거',
    experienceId: null,
    variantOf: null,
    caseId: null,
    validationStatus: 'VALID',
    validationNote: null,
    createdAt: now,
    ...overrides,
  });

const answer = (questionId: number) =>
  attempts.add({
    questionId,
    conceptId: 1,
    userAnswer: '선택도가 낮아서',
    correct: true,
    confidence: 'SURE',
    hintUsed: false,
    misconception: null,
    answeredAt: now,
  });

beforeEach(async () => {
  await testDb.truncateAll();
  await new ConceptRepository(testDb.db).applySeed(
    {
      tracks: [{ key: 'database', name: '관계형 DB', weight: 1, description: 'DB' }],
      concepts: [{ name: '인덱스', track: 'database', aliases: [], description: 'D', requires: [], related: [] }],
    },
    now,
  );
});
afterAll(() => testDb.close());

describe('0013 마이그레이션 (ADR-0038)', () => {
  it('풀이·변형이 없는 상황 판단형은 지우고, 남은 상황 판단형과 길이 상한을 넘는 VALID 문제는 INVALID로 둔다', async () => {
    const scenario = { angle: 'SCENARIO' } as const;
    const deleted = await add({ ...scenario, validationStatus: 'INVALID', validationNote: '전에 걸림' });
    const answered = await add(scenario);
    await answer(answered);
    const original = await add({ ...scenario, validationStatus: 'INVALID', validationNote: '전에 걸림' });
    const variant = await add({ ...scenario, variantOf: original });
    const longPrompt = await add({ prompt: `${'가'.repeat(150)}?` });
    const threeSentences = await add({ prompt: '테이블이 크다. 쓰기가 잦다. 인덱스를 더할까?' });
    const longChoice = await add({
      choices: [
        { text: '선택도가 낮아서', misconception: null },
        { text: '나'.repeat(41), misconception: '믿음' },
      ],
    });
    const fits = await add({ prompt: `${'가'.repeat(127)} 응답이 3.5초 걸린다. 무엇부터 볼까?` });

    for (const statement of migration) await testDb.db.execute(sql.raw(statement));

    const rows = await testDb.db
      .select({ id: quizQuestion.id, status: quizQuestion.validationStatus, note: quizQuestion.validationNote })
      .from(quizQuestion)
      .orderBy(asc(quizQuestion.id));
    const scenarioNote = 'ADR-0038: 경험에서 만든 상황 판단형은 더 내지 않는다';
    const lengthNote = 'ADR-0038: 길이 상한(질문 150자·2문장, 보기 40자)을 넘는다';
    expect(rows).toEqual([
      { id: answered, status: 'INVALID', note: scenarioNote },
      // 변형이 가리키던 문제는 남는다. 변형은 풀이가 없어 함께 지워진다.
      { id: original, status: 'INVALID', note: '전에 걸림' },
      { id: longPrompt, status: 'INVALID', note: lengthNote },
      { id: threeSentences, status: 'INVALID', note: lengthNote },
      { id: longChoice, status: 'INVALID', note: lengthNote },
      { id: fits, status: 'VALID', note: null },
    ]);
    expect(rows.map((r) => r.id)).not.toContain(deleted);
    expect(rows.map((r) => r.id)).not.toContain(variant);
  });
});
