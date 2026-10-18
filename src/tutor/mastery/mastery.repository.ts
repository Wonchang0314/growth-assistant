import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db, type Tx } from '../../core/db/db.module.js';
import type { ConceptMergeParticipant } from '../../core/knowledge/concept-merge.js';
import { conceptMastery } from './mastery.schema.js';
import type { ConceptMastery } from './mastery.js';

@Injectable()
export class MasteryRepository implements ConceptMergeParticipant {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(conceptId: number, db: Db | Tx = this.db): Promise<ConceptMastery | undefined> {
    const [row] = await db.select().from(conceptMastery).where(eq(conceptMastery.conceptId, conceptId));
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

  async save(row: ConceptMastery, db: Db | Tx = this.db): Promise<void> {
    await db.insert(conceptMastery).values(row).onConflictDoUpdate({ target: conceptMastery.conceptId, set: row });
  }

  /**
   * 개념 병합: 채점된 응답이 더 많은 쪽 행 하나만 [targetId]에 남긴다. 같으면 대상 행을 남긴다.
   * 두 FSRS 상태를 섞으면 어느 쪽 기억도 아닌 값이 되므로 섞지 않는다.
   */
  async moveConcept(tx: Tx, sourceId: number, targetId: number): Promise<void> {
    const source = await this.find(sourceId, tx);
    if (!source) return;
    const target = await this.find(targetId, tx);
    await tx.delete(conceptMastery).where(eq(conceptMastery.conceptId, sourceId));
    if (target && target.gradedAttempts >= source.gradedAttempts) return;
    await this.save({ ...source, conceptId: targetId }, tx);
  }
}
