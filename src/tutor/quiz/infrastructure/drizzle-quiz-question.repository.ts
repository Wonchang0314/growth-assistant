import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, notExists, sql } from 'drizzle-orm';
import { DB, type Db, type Tx } from '../../../core/db/db.module.js';
import type { ConceptMergeParticipant } from '../../../core/knowledge/concept-merge.js';
import { type NewQuestion, QuizQuestionRepository } from '../application/ports.js';
import type { Question, QuestionType } from '../domain/quiz-question.js';
import type { QuestionHistory } from '../domain/variant.js';
import { quizAttempt } from './quiz-attempt.schema.js';
import { quizQuestion } from './quiz-question.schema.js';

type Row = typeof quizQuestion.$inferSelect;

@Injectable()
export class DrizzleQuizQuestionRepository extends QuizQuestionRepository implements ConceptMergeParticipant {
  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async add(question: NewQuestion): Promise<number> {
    const [row] = await this.db
      .insert(quizQuestion)
      .values(
        question.type === 'MULTIPLE_CHOICE'
          ? question
          : { ...question, acceptedAnswers: [...question.acceptedAnswers] },
      )
      .returning({ id: quizQuestion.id });
    if (!row) throw new Error('문제를 저장하지 못했다');
    return row.id;
  }

  async keyPoints(conceptId: number): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ keyPoint: quizQuestion.keyPoint })
      .from(quizQuestion)
      .where(and(eq(quizQuestion.conceptId, conceptId), eq(quizQuestion.validationStatus, 'VALID')))
      .orderBy(asc(quizQuestion.keyPoint));
    return rows.map((r) => r.keyPoint);
  }

  async find(id: number): Promise<Question | undefined> {
    const [row] = await this.db.select().from(quizQuestion).where(eq(quizQuestion.id, id));
    return row && toQuestion(row);
  }

  async findServable(conceptId: number, limit: number): Promise<Question[]> {
    const answered = this.db.select().from(quizAttempt).where(eq(quizAttempt.questionId, quizQuestion.id));
    const rows = await this.db
      .select()
      .from(quizQuestion)
      .where(
        and(
          eq(quizQuestion.conceptId, conceptId),
          eq(quizQuestion.validationStatus, 'VALID'),
          eq(quizQuestion.reported, false),
          notExists(answered),
        ),
      )
      // 흔들린 문제의 변형을 먼저 낸다(설계 문서 7.3 "변형 문제").
      .orderBy(sql`${quizQuestion.variantOf} IS NULL`, asc(quizQuestion.createdAt), asc(quizQuestion.id))
      .limit(limit);
    return rows.map(toQuestion);
  }

  async findHistory(conceptId: number): Promise<QuestionHistory[]> {
    const usable = and(
      eq(quizQuestion.conceptId, conceptId),
      eq(quizQuestion.validationStatus, 'VALID'),
      eq(quizQuestion.reported, false),
    );
    const [rows, attempts] = await Promise.all([
      this.db.select().from(quizQuestion).where(usable).orderBy(asc(quizQuestion.createdAt), asc(quizQuestion.id)),
      this.db
        .select({
          questionId: quizAttempt.questionId,
          correct: quizAttempt.isCorrect,
          confidence: quizAttempt.confidence,
          hintUsed: quizAttempt.hintUsed,
          userAnswer: quizAttempt.userAnswer,
          misconception: quizAttempt.misconception,
        })
        .from(quizAttempt)
        .innerJoin(quizQuestion, eq(quizQuestion.id, quizAttempt.questionId))
        .where(usable)
        .orderBy(asc(quizAttempt.answeredAt), asc(quizAttempt.id)),
    ]);
    // 시간순이라 나중 풀이가 덮어쓴다.
    const last = new Map(attempts.map(({ questionId, ...a }) => [questionId, a]));
    const varied = new Set(rows.flatMap((r) => (r.variantOf === null ? [] : [r.variantOf])));
    return rows.map((r) => ({
      question: toQuestion(r),
      lastAnswer: last.get(r.id) ?? null,
      hasVariant: varied.has(r.id),
    }));
  }

  async countValid(conceptId: number): Promise<Record<QuestionType, number>> {
    const rows = await this.db
      .select({ type: quizQuestion.type, n: count() })
      .from(quizQuestion)
      .where(and(eq(quizQuestion.conceptId, conceptId), eq(quizQuestion.validationStatus, 'VALID')))
      .groupBy(quizQuestion.type);
    const of = (type: QuestionType) => rows.find((r) => r.type === type)?.n ?? 0;
    return { MULTIPLE_CHOICE: of('MULTIPLE_CHOICE'), FILL_BLANK: of('FILL_BLANK') };
  }

  async markServed(ids: readonly number[]): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(quizQuestion)
      .set({ usedCount: sql`${quizQuestion.usedCount} + 1` })
      .where(inArray(quizQuestion.id, [...ids]));
  }

  async report(id: number, reason: string): Promise<void> {
    await this.db.update(quizQuestion).set({ reported: true, reportReason: reason }).where(eq(quizQuestion.id, id));
  }

  /** 개념 병합: 문제를 대상 개념으로 옮긴다. 풀이는 문제를 따라간다. */
  async moveConcept(tx: Tx, sourceId: number, targetId: number): Promise<void> {
    await tx.update(quizQuestion).set({ conceptId: targetId }).where(eq(quizQuestion.conceptId, sourceId));
  }
}

function toQuestion(row: Row): Question {
  const base = {
    id: row.id,
    conceptId: row.conceptId,
    angle: row.angle,
    keyPoint: row.keyPoint,
    difficulty: toDifficulty(row.difficulty),
    prompt: row.prompt,
    answer: row.answer,
    explanation: row.explanation,
    referenceMaterial: row.referenceMaterial,
    experienceId: row.experienceId,
    variantOf: row.variantOf,
    reported: row.reported,
  };
  if (row.type === 'FILL_BLANK') return { ...base, type: 'FILL_BLANK', acceptedAnswers: row.acceptedAnswers };
  // 객관식만 보기가 있다는 것은 CHECK 제약이 지킨다.
  if (row.choices === null) throw new Error(`객관식인데 보기가 없다: 문제 ${row.id}`);
  return { ...base, type: 'MULTIPLE_CHOICE', choices: row.choices };
}

function toDifficulty(n: number): 1 | 2 | 3 {
  if (n === 1 || n === 2 || n === 3) return n;
  throw new Error(`난이도는 1~3이다: ${n}`);
}
