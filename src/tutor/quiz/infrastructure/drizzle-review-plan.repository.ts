import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DB, type Db } from '../../../core/db/db.module.js';
import { ReviewPlanRepository } from '../application/ports.js';
import { reviewPlan } from './review-plan.schema.js';

@Injectable()
export class DrizzleReviewPlanRepository extends ReviewPlanRepository {
  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async find(date: string): Promise<number[]> {
    const rows = await this.db
      .select({ conceptId: reviewPlan.conceptId })
      .from(reviewPlan)
      .where(eq(reviewPlan.planDate, date))
      .orderBy(asc(reviewPlan.position));
    return rows.map((r) => r.conceptId);
  }

  async saveIfAbsent(date: string, conceptIds: readonly number[]): Promise<number[]> {
    if (conceptIds.length > 0) {
      // 동시에 정하면 뒤쪽 줄은 먼저 저장한 쪽의 (날짜, 순서)와 겹쳐 건너뛴다. 먼저 저장한 계획이 더 짧을 때만 섞인다.
      await this.db
        .insert(reviewPlan)
        .values(conceptIds.map((conceptId, position) => ({ planDate: date, position, conceptId })))
        .onConflictDoNothing();
    }
    return this.find(date);
  }
}
