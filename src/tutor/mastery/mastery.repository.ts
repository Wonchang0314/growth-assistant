import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../../core/db/db.module.js';
import { conceptMastery } from './mastery.schema.js';
import type { ConceptMastery } from './mastery.js';

@Injectable()
export class MasteryRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(conceptId: number): Promise<ConceptMastery | undefined> {
    const [row] = await this.db.select().from(conceptMastery).where(eq(conceptMastery.conceptId, conceptId));
    return row;
  }

  /** 행이 없는 개념만 넣는다. 이미 있는 일정과 점수는 그대로 둔다. */
  async addMissing(rows: readonly ConceptMastery[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insert(conceptMastery)
      .values([...rows])
      .onConflictDoNothing();
  }

  async save(row: ConceptMastery): Promise<void> {
    await this.db.insert(conceptMastery).values(row).onConflictDoUpdate({ target: conceptMastery.conceptId, set: row });
  }
}
