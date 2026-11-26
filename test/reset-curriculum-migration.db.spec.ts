import { afterAll, describe, expect, it } from 'vitest';
import type { ConceptSeed, SeedConcept } from '../src/core/knowledge/concept-seed.js';
import { ConceptRepository } from '../src/core/knowledge/concept.repository.js';
import { decisionCase, decisionCaseConcept } from '../src/core/memory/decision-case.schema.js';
import { experience, experienceConcept } from '../src/core/memory/experience.schema.js';
import { documentChunk, sourceDocument, syncCursor } from '../src/core/memory/source-document.schema.js';
import { appSetting } from '../src/core/setting/app-setting.schema.js';
import { conceptMastery } from '../src/tutor/mastery/mastery.schema.js';
import { GUIDELINE_KEY } from '../src/tutor/quiz/domain/quiz-guideline.js';
import { quizAttempt } from '../src/tutor/quiz/infrastructure/quiz-attempt.schema.js';
import { quizQuestion } from '../src/tutor/quiz/infrastructure/quiz-question.schema.js';
import { reviewPlan } from '../src/tutor/quiz/infrastructure/review-plan.schema.js';
import { studyNote, studyNoteConcept } from '../src/tutor/study/study-note.schema.js';
import { connectTestDb } from './db/test-db.js';

const testDb = connectTestDb();
const { db } = testDb;
const concepts = new ConceptRepository(db);
const now = new Date('2026-11-27T00:00:00Z');

const RESET = [
  'quiz_attempt',
  'quiz_question',
  'review_plan',
  'concept_mastery',
  'study_note_concept',
  'study_note',
  'experience_concept',
  'decision_case_concept',
  'concept_edge',
  'concept',
  'track',
];
const KEPT = ['source_document', 'document_chunk', 'sync_cursor', 'experience', 'decision_case', 'app_setting'];

const counts = async (tables: readonly string[]) =>
  Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await testDb.count(t)] as const)));

const concept = (name: string, track: string, requires: string[] = []): SeedConcept => ({
  name,
  track,
  aliases: [],
  description: 'D',
  requires,
  related: [],
});

const oldSeed: ConceptSeed = {
  tracks: [{ key: 'database', name: '관계형 DB', weight: 1, description: 'DB' }],
  concepts: [concept('인덱스', 'database', ['B-트리']), concept('B-트리', 'database')],
};
const newSeed: ConceptSeed = {
  tracks: [{ key: 'accounting', name: '회계 원리와 결산', weight: 0.2, description: '회계' }],
  concepts: [concept('선수금', 'accounting', ['매출 인식']), concept('매출 인식', 'accounting')],
};

/** 옛 커리큘럼의 학습 상태와 Notion 경험. ID는 TRUNCATE … RESTART IDENTITY 뒤라 모두 1부터다(개념 1 = 인덱스). */
async function insertOldData() {
  await concepts.applySeed(oldSeed, now);
  await db.insert(studyNote).values({ topic: '인덱스', summary: '요약', createdAt: now });
  await db.insert(studyNoteConcept).values({ noteId: 1, conceptId: 1, signal: 'CONFUSED' });
  await db.insert(conceptMastery).values({
    conceptId: 1,
    state: 'REVIEW',
    stability: 1,
    difficulty: 5,
    reps: 1,
    lapses: 0,
    dueAt: now,
    masteryScore: 0.5,
    weaknessScore: 0.5,
    gradedAttempts: 1,
    updatedAt: now,
  });
  await db.insert(reviewPlan).values({ planDate: '2026-11-27', position: 0, conceptId: 1 });
  await db.insert(sourceDocument).values({
    source: 'NOTION',
    externalId: 'page-1',
    title: '장애 회고',
    url: 'https://notion.so/page-1',
    contentHash: 'h',
    sourceUpdatedAt: now,
    syncedAt: now,
  });
  await db.insert(documentChunk).values({ documentId: 1, seq: 0, chunkHash: 'h', content: '본문' });
  await db.insert(syncCursor).values({ source: 'NOTION', lastSyncedAt: now });
  await db.insert(experience).values({
    documentId: 1,
    origin: 'DOCUMENT',
    title: '느린 조회',
    situation: 's',
    task: 't',
    action: 'a',
    result: 'r',
    lesson: 'l',
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(experienceConcept).values({ experienceId: 1, conceptId: 1 });
  await db.insert(decisionCase).values({
    experienceId: 1,
    situation: 's',
    constraints: [],
    options: [],
    decision: 'd',
    rationale: 'r',
    outcome: 'o',
    invariants: [],
    kind: 'EXPERIENCE',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(decisionCaseConcept).values({ caseId: 1, conceptId: 1 });
  const question = {
    conceptId: 1,
    type: 'MULTIPLE_CHOICE',
    angle: 'WHY',
    keyPoint: '핵심',
    difficulty: 1,
    prompt: '성별 컬럼 인덱스가 느린 이유는?',
    choices: [{ text: '선택도가 낮아서', misconception: null }],
    answer: '선택도가 낮아서',
    explanation: '해설',
    referenceMaterial: '근거',
    experienceId: 1,
    caseId: 1,
    validationStatus: 'VALID',
    createdAt: now,
  } as const;
  // 변형이 원래 문제를 가리켜도 한 문장으로 함께 지워진다.
  await db.insert(quizQuestion).values([question, { ...question, variantOf: 1 }]);
  await db.insert(quizAttempt).values({
    questionId: 2,
    userAnswer: '선택도가 낮아서',
    isCorrect: true,
    confidence: 'SURE',
    hintUsed: false,
    answeredAt: now,
  });
  await db.insert(appSetting).values({ key: GUIDELINE_KEY, value: '- 보기 글은 짧게 쓴다' });
}

afterAll(() => testDb.close());

describe('0015 마이그레이션 (ADR-0042)', () => {
  it('학습 상태와 개념·트랙을 지우고 Notion 원문·경험 카드·판단 사례·출제 지침은 남겨, 새 시드를 적재할 수 있게 한다', async () => {
    await testDb.truncateAll();
    await insertOldData();
    const tables = [...RESET, ...KEPT];
    const before = await counts(tables);
    expect(Object.values(before)).not.toContain(0);
    // 학습 기록이 옛 개념을 가리켜, 초기화 없이는 새 시드 적재가 외래 키로 취소된다.
    await expect(concepts.applySeed(newSeed, now)).rejects.toThrow();

    // 테스트 DB에는 이미 적용됐으므로, 옛 데이터를 넣은 뒤 다시 돌려 효과를 본다.
    await testDb.rerunMigration('0015_reset_curriculum.sql');

    expect(await counts(tables)).toEqual({ ...before, ...Object.fromEntries(RESET.map((t) => [t, 0])) });

    await expect(concepts.applySeed(newSeed, now)).resolves.toMatchObject({ newConcepts: 2, newEdges: 1 });
    expect(await counts(['track', 'concept', 'concept_edge'])).toEqual({ track: 1, concept: 2, concept_edge: 1 });
  });
});
