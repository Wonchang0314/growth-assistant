import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../../core/db/db.module.js';
import { type NewQuestion, QuizQuestionRepository } from '../application/ports.js';
import { quizQuestion } from './quiz-question.schema.js';

@Injectable()
export class DrizzleQuizQuestionRepository extends QuizQuestionRepository {
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
}
