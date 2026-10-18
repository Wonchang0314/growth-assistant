import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte } from 'drizzle-orm';
import { DB, type Db, type Tx } from '../../core/db/db.module.js';
import type { ConceptMergeParticipant } from '../../core/knowledge/concept-merge.js';
import { concept, track } from '../../core/knowledge/concept.schema.js';
import { conceptMastery } from './mastery.schema.js';
import { type ConceptMastery, MIN_GRADED_ATTEMPTS, WEAK_THRESHOLD } from './mastery.js';

@Injectable()
export class MasteryRepository implements ConceptMergeParticipant {
  constructor(@Inject(DB) private readonly db: Db) {}

  async find(conceptId: number, db: Db | Tx = this.db): Promise<ConceptMastery | undefined> {
    const [row] = await db.select().from(conceptMastery).where(eq(conceptMastery.conceptId, conceptId));
    return row;
  }

  /** 복습할 때가 된 개념. 예정일이 이른 것부터. */
  async findDue(now: Date, limit: number): Promise<number[]> {
    const rows = await this.db
      .select({ conceptId: conceptMastery.conceptId })
      .from(conceptMastery)
      .where(lte(conceptMastery.dueAt, now))
      .orderBy(asc(conceptMastery.dueAt), asc(conceptMastery.conceptId))
      .limit(limit);
    return rows.map((r) => r.conceptId);
  }

  /** 약점 개념 (설계 문서 8장). 약점 점수가 높은 것부터. */
  async findWeak(limit: number): Promise<ConceptMastery[]> {
    return this.db
      .select()
      .from(conceptMastery)
      .where(
        and(gte(conceptMastery.gradedAttempts, MIN_GRADED_ATTEMPTS), gte(conceptMastery.weaknessScore, WEAK_THRESHOLD)),
      )
      .orderBy(desc(conceptMastery.weaknessScore), asc(conceptMastery.conceptId))
      .limit(limit);
  }

  async findMany(conceptIds: readonly number[]): Promise<ConceptMastery[]> {
    if (conceptIds.length === 0) return [];
    return this.db
      .select()
      .from(conceptMastery)
      .where(inArray(conceptMastery.conceptId, [...conceptIds]));
  }

  /** 일정은 있지만 채점된 응답이 모자라 약점인지 모르는 개념 수. */
  async countUnmeasured(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(conceptMastery)
      .where(lt(conceptMastery.gradedAttempts, MIN_GRADED_ATTEMPTS));
    return row?.n ?? 0;
  }

  /** 아직 일정이 없는 승인된 개념과 그 트랙 가중치. 새 개념을 고를 때 쓴다. */
  async findUnscheduled(): Promise<{ conceptId: number; weight: number }[]> {
    return this.db
      .select({ conceptId: concept.id, weight: track.weight })
      .from(concept)
      .innerJoin(track, eq(track.id, concept.trackId))
      .leftJoin(conceptMastery, eq(conceptMastery.conceptId, concept.id))
      .where(and(eq(concept.status, 'ACTIVE'), isNull(conceptMastery.conceptId)))
      .orderBy(asc(concept.id));
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
