import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import type { CaseScreen, DecisionCaseBody, DecisionCaseStatus } from './decision-case.js';
import { decisionCase, decisionCaseConcept } from './decision-case.schema.js';
import type { ExperienceCard } from './experience.js';
import { experience, experienceConcept } from './experience.schema.js';

/** 선별·추상화에 넘기는 경험 카드. 날짜는 판단과 상관없어 뺀다. */
export type CaseSourceCard = Omit<ExperienceCard, 'occurredAt'> & { readonly id: number };

const cardColumns = {
  id: experience.id,
  projectName: experience.projectName,
  title: experience.title,
  situation: experience.situation,
  task: experience.task,
  action: experience.action,
  result: experience.result,
  lesson: experience.lesson,
};

/** 경험 카드에서 판단 사례를 만드는 데 필요한 읽기·쓰기 (설계 문서 7.1 "판단 사례"). */
@Injectable()
export class DecisionCaseRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 아직 선별하지 않은 카드. 오래된 카드부터. */
  findUnscreened(limit: number): Promise<CaseSourceCard[]> {
    return this.db
      .select(cardColumns)
      .from(experience)
      .where(isNull(experience.caseScreen))
      .orderBy(asc(experience.id))
      .limit(limit);
  }

  async saveScreening(results: readonly { id: number; screen: CaseScreen }[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const r of results) {
        await tx.update(experience).set({ caseScreen: r.screen }).where(eq(experience.id, r.id));
      }
    });
  }

  /** 판단이 있다고 고른 카드 중 아직 판단 사례가 없는 것. 오래된 카드부터. */
  findCandidates(limit: number): Promise<CaseSourceCard[]> {
    return this.db
      .select(cardColumns)
      .from(experience)
      .leftJoin(decisionCase, eq(decisionCase.experienceId, experience.id))
      .where(and(eq(experience.caseScreen, 'DECISION'), isNull(decisionCase.id)))
      .orderBy(asc(experience.id))
      .limit(limit);
  }

  findCards(ids: readonly number[]): Promise<CaseSourceCard[]> {
    return this.db
      .select(cardColumns)
      .from(experience)
      .where(inArray(experience.id, [...ids]))
      .orderBy(asc(experience.id));
  }

  /** 카드의 판단 사례를 저장한다. 이미 있으면 바꾸고, 개념은 카드의 개념을 그대로 잇는다. */
  async save(input: {
    experienceId: number;
    body: DecisionCaseBody;
    status: DecisionCaseStatus;
    reviewNote: string | null;
    now: Date;
  }): Promise<void> {
    const { experienceId, now } = input;
    await this.db.transaction(async (tx) => {
      await tx.delete(decisionCase).where(eq(decisionCase.experienceId, experienceId));
      const [row] = await tx
        .insert(decisionCase)
        .values({
          ...input.body,
          experienceId,
          status: input.status,
          reviewNote: input.reviewNote,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: decisionCase.id });
      if (!row) throw new Error(`판단 사례를 저장하지 못했다: 카드 ${experienceId}`);
      await tx.insert(decisionCaseConcept).select(
        tx
          .select({ caseId: sql<number>`${row.id}::bigint`.as('case_id'), conceptId: experienceConcept.conceptId })
          .from(experienceConcept)
          .where(eq(experienceConcept.experienceId, experienceId)),
      );
    });
  }
}
