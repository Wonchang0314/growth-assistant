import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../../../core/db/db.module.js';
import { type NewAttempt, QuizAttemptRepository } from '../application/ports.js';
import type { AttemptRecord } from '../domain/grading.js';
import { quizAttempt } from './quiz-attempt.schema.js';
import { quizQuestion } from './quiz-question.schema.js';

@Injectable()
export class DrizzleQuizAttemptRepository extends QuizAttemptRepository {
  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async add(attempt: NewAttempt): Promise<number> {
    const [row] = await this.db
      .insert(quizAttempt)
      .values({
        questionId: attempt.questionId,
        userAnswer: attempt.userAnswer,
        isCorrect: attempt.correct,
        confidence: attempt.confidence,
        hintUsed: attempt.hintUsed,
        misconception: attempt.misconception,
        answeredAt: attempt.answeredAt,
      })
      .returning({ id: quizAttempt.id });
    if (!row) throw new Error('풀이를 저장하지 못했다');
    return row.id;
  }

  async findForConcept(conceptId: number): Promise<AttemptRecord[]> {
    return this.db
      .select({
        conceptId: quizQuestion.conceptId,
        correct: quizAttempt.isCorrect,
        confidence: quizAttempt.confidence,
        hintUsed: quizAttempt.hintUsed,
        misconception: quizAttempt.misconception,
        answeredAt: quizAttempt.answeredAt,
      })
      .from(quizAttempt)
      .innerJoin(quizQuestion, eq(quizQuestion.id, quizAttempt.questionId))
      .where(and(eq(quizQuestion.conceptId, conceptId), eq(quizQuestion.reported, false)))
      .orderBy(asc(quizAttempt.answeredAt), asc(quizAttempt.id));
  }

  async countForQuestion(questionId: number): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(quizAttempt).where(eq(quizAttempt.questionId, questionId));
    return row?.n ?? 0;
  }

  async countOnDate(date: string, timeZone: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(quizAttempt)
      .where(sql`(${quizAttempt.answeredAt} AT TIME ZONE ${timeZone})::date = ${date}::date`);
    return row?.n ?? 0;
  }
}
