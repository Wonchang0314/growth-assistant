import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, ne, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Db } from '../db/db.module.js';
import type { ConceptStatus } from '../knowledge/concept.js';
import { concept, conceptEdge, track } from '../knowledge/concept.schema.js';
import { experience, experienceConcept } from '../memory/experience.schema.js';

/** 검토할 개념. 판단 근거로 연결된 카드 수와 앞쪽 카드 제목을 함께 싣는다. */
export interface PendingConcept {
  readonly name: string;
  readonly status: ConceptStatus;
  readonly track: string;
  readonly parent: string | null;
  readonly description: string;
  readonly aliases: readonly string[];
  readonly cardCount: number;
  readonly cardTitles: readonly string[];
}

const CARD_TITLES = 3;

@Injectable()
export class ConceptReviewRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 승인 대기(PROPOSED)와 아직 사람이 보지 않은 자동 승인 개념. 카드가 많이 붙은 것부터. */
  async findPending(limit: number): Promise<PendingConcept[]> {
    const parent = alias(concept, 'parent');
    const cardCount = count(experienceConcept.experienceId);
    const rows = await this.db
      .select({
        id: concept.id,
        name: concept.name,
        status: concept.status,
        track: track.key,
        parent: parent.name,
        description: concept.description,
        aliases: concept.aliases,
        cardCount,
      })
      .from(concept)
      .innerJoin(track, eq(track.id, concept.trackId))
      .leftJoin(conceptEdge, and(eq(conceptEdge.fromId, concept.id), eq(conceptEdge.type, 'PART_OF')))
      .leftJoin(parent, eq(parent.id, conceptEdge.toId))
      .leftJoin(experienceConcept, eq(experienceConcept.conceptId, concept.id))
      .where(or(eq(concept.status, 'PROPOSED'), and(eq(concept.status, 'ACTIVE'), eq(concept.autoApproved, true))))
      .groupBy(concept.id, track.key, parent.name)
      .orderBy(desc(cardCount), asc(concept.id))
      .limit(limit);
    if (rows.length === 0) return [];

    const cards = await this.db
      .select({ conceptId: experienceConcept.conceptId, title: experience.title })
      .from(experienceConcept)
      .innerJoin(experience, eq(experience.id, experienceConcept.experienceId))
      .where(
        inArray(
          experienceConcept.conceptId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(experience.id));
    const titles = Map.groupBy(cards, (c) => c.conceptId);
    return rows.map(({ id, ...row }) => ({
      ...row,
      cardTitles: (titles.get(id) ?? []).slice(0, CARD_TITLES).map((c) => c.title),
    }));
  }

  /** 승인하고 사람이 본 것으로 남긴다. [parentId]가 undefined면 상위 관계를 그대로 두고, null이면 지운다. */
  async approve(input: {
    id: number;
    name?: string | undefined;
    track?: string | undefined;
    parentId: number | null | undefined;
    description?: string | undefined;
    aliases?: readonly string[] | undefined;
    now: Date;
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [trackRow] =
        input.track === undefined
          ? []
          : await tx.select({ id: track.id }).from(track).where(eq(track.key, input.track));
      await tx
        .update(concept)
        .set({
          name: input.name,
          trackId: trackRow?.id,
          description: input.description,
          aliases: input.aliases && [...input.aliases],
          status: 'ACTIVE',
          autoApproved: false,
          updatedAt: input.now,
        })
        .where(eq(concept.id, input.id));
      if (input.parentId === undefined) return;
      await tx.delete(conceptEdge).where(and(eq(conceptEdge.fromId, input.id), eq(conceptEdge.type, 'PART_OF')));
      if (input.parentId !== null) {
        await tx.insert(conceptEdge).values({ fromId: input.id, toId: input.parentId, type: 'PART_OF' });
      }
    });
  }

  /**
   * [sourceId]의 카드 연결과 하위 개념을 [targetId]로 옮기고, 대상의 별칭을 [targetAliases]로 바꾼 뒤 지운다.
   * 옮긴 카드 연결 수를 돌려준다. 학습 기록이 연결된 개념은 외래 키 때문에 지우지 못하고 전체가 취소된다.
   */
  async merge(input: {
    sourceId: number;
    targetId: number;
    targetAliases: readonly string[];
    now: Date;
  }): Promise<number> {
    const { sourceId, targetId } = input;
    return this.db.transaction(async (tx) => {
      const links = await tx
        .delete(experienceConcept)
        .where(eq(experienceConcept.conceptId, sourceId))
        .returning({ experienceId: experienceConcept.experienceId });
      if (links.length > 0) {
        await tx
          .insert(experienceConcept)
          .values(links.map((l) => ({ experienceId: l.experienceId, conceptId: targetId })))
          .onConflictDoNothing();
      }
      const children = await tx
        .select({ fromId: conceptEdge.fromId })
        .from(conceptEdge)
        .where(and(eq(conceptEdge.toId, sourceId), eq(conceptEdge.type, 'PART_OF'), ne(conceptEdge.fromId, targetId)));
      if (children.length > 0) {
        await tx
          .insert(conceptEdge)
          .values(children.map((c) => ({ fromId: c.fromId, toId: targetId, type: 'PART_OF' as const })))
          .onConflictDoNothing();
      }
      await tx
        .update(concept)
        .set({ aliases: [...input.targetAliases], updatedAt: input.now })
        .where(eq(concept.id, targetId));
      await tx.delete(concept).where(eq(concept.id, sourceId));
      return links.length;
    });
  }

  async reject(id: number, now: Date): Promise<void> {
    await this.db
      .update(concept)
      .set({ status: 'REJECTED', autoApproved: false, updatedAt: now })
      .where(eq(concept.id, id));
  }
}
