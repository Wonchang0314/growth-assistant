import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DB, type Db } from '../db/db.module.js';
import type { ConceptEdgeType, ConceptTerms } from './concept.js';
import { concept, conceptEdge, track } from './concept.schema.js';
import type { Vocabulary } from './concept-proposal.js';
import type { ConceptSeed } from './concept-seed.js';

/** 개념 요약: 학습 맥락에 싣는 부분. */
export interface ConceptSummary {
  readonly id: number;
  readonly name: string;
  readonly track: string;
  readonly description: string;
  readonly parent: string | null;
}

export interface SeedResult {
  readonly tracks: number;
  readonly concepts: number;
  readonly newConcepts: number;
  readonly newEdges: number;
  readonly removedConcepts: number;
  readonly removedEdges: number;
}

@Injectable()
export class ConceptRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 승인된(ACTIVE) 개념의 이름과 별칭. 이름 매칭에 쓴다. 시드 기준 수백 개라 한 번에 읽는다. */
  async findActiveTerms(): Promise<ConceptTerms[]> {
    return this.db
      .select({ id: concept.id, name: concept.name, aliases: concept.aliases })
      .from(concept)
      .where(eq(concept.status, 'ACTIVE'))
      .orderBy(concept.id);
  }

  /** 새 개념 제안과 비교할 어휘. 승인 대기·거절 개념까지 모두 담는다. */
  async findVocabulary(): Promise<Vocabulary> {
    const tracks = await this.db.select({ key: track.key }).from(track).orderBy(track.id);
    const concepts = await this.db
      .select({
        id: concept.id,
        name: concept.name,
        aliases: concept.aliases,
        status: concept.status,
        origin: concept.origin,
        track: track.key,
      })
      .from(concept)
      .innerJoin(track, eq(track.id, concept.trackId))
      .orderBy(concept.id);
    return { tracks: tracks.map((t) => t.key), concepts };
  }

  /** 개념 요약을 [ids] 순서대로 돌려준다. 없는 id는 빠진다. */
  async findSummaries(ids: readonly number[]): Promise<ConceptSummary[]> {
    if (ids.length === 0) return [];
    const parent = alias(concept, 'parent');
    const rows = await this.db
      .select({
        id: concept.id,
        name: concept.name,
        track: track.name,
        description: concept.description,
        parent: parent.name,
      })
      .from(concept)
      .innerJoin(track, eq(track.id, concept.trackId))
      .leftJoin(conceptEdge, and(eq(conceptEdge.fromId, concept.id), eq(conceptEdge.type, 'PART_OF')))
      .leftJoin(parent, eq(parent.id, conceptEdge.toId))
      .where(inArray(concept.id, [...ids]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  /**
   * 개념마다 먼저 알아야 하는 개념(선수 관계를 [maxDepth]단계까지 따라감)의 이름을 가까운 것부터 돌려준다.
   * 선수 개념이 없으면 키가 없다.
   */
  async findPrerequisites(ids: readonly number[], maxDepth: number): Promise<Map<number, string[]>> {
    if (ids.length === 0) return new Map();
    const result = await this.db.execute<{ origin_id: string; name: string; depth: number }>(sql`
      WITH RECURSIVE prereq(origin_id, concept_id, depth) AS (
        SELECT from_id, to_id, 1 FROM concept_edge
        WHERE type = 'PREREQUISITE' AND from_id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})
        UNION
        SELECT p.origin_id, e.to_id, p.depth + 1
        FROM prereq p JOIN concept_edge e ON e.from_id = p.concept_id AND e.type = 'PREREQUISITE'
        WHERE p.depth < ${maxDepth}
      )
      SELECT p.origin_id, c.name, min(p.depth)::int AS depth
      FROM prereq p JOIN concept c ON c.id = p.concept_id
      WHERE c.status = 'ACTIVE'
      GROUP BY p.origin_id, c.id, c.name
      ORDER BY depth, c.id
    `);
    const byOrigin = new Map<number, string[]>();
    for (const row of result.rows) {
      const origin = Number(row.origin_id);
      byOrigin.set(origin, [...(byOrigin.get(origin) ?? []), row.name]);
    }
    return byOrigin;
  }

  /**
   * 시드를 한 트랜잭션으로 반영한다. 여러 번 돌려도 결과가 같다.
   * - 트랙은 키로, 개념은 이름으로 찾아 있으면 트랙·별칭·설명을 시드대로 고친다. 승인 상태는 건드리지 않는다
   *   (대화에서 거절한 개념을 시드 적재가 되살리지 않게).
   * - 시드 개념끼리의 관계는 시드대로 맞춘다(없으면 더하고, 시드에 없으면 지운다). 다른 개념과의 관계는 건드리지 않는다.
   * - 시드에서 빠진 시드 개념(관계 포함)과 트랙은 지운다. 수집·대화에서 생긴 개념은 남긴다.
   *   학습 기록이 연결된 개념이나 다른 개념이 남은 트랙을 지우려 하면 외래 키 오류로 전체가 취소된다.
   */
  async applySeed(seed: ConceptSeed, now: Date): Promise<SeedResult> {
    return this.db.transaction(async (tx) => {
      const tracks = await tx
        .insert(track)
        .values(seed.tracks.map((t) => ({ ...t })))
        .onConflictDoUpdate({
          target: track.key,
          set: {
            name: sql`excluded.name`,
            weight: sql`excluded.weight`,
            description: sql`excluded.description`,
          },
        })
        .returning({ id: track.id, key: track.key });
      const trackId = new Map(tracks.map((t) => [t.key, t.id]));

      const before = await tx.select({ count: sql<number>`count(*)::int` }).from(concept);
      const concepts =
        seed.concepts.length === 0
          ? []
          : await tx
              .insert(concept)
              .values(
                seed.concepts.map((c) => ({
                  trackId: trackIdOf(trackId, c.track),
                  name: c.name,
                  aliases: [...c.aliases],
                  description: c.description,
                  status: 'ACTIVE' as const,
                  origin: 'SEED' as const,
                  createdAt: now,
                  updatedAt: now,
                })),
              )
              .onConflictDoUpdate({
                target: concept.name,
                set: {
                  trackId: sql`excluded.track_id`,
                  aliases: sql`excluded.aliases`,
                  description: sql`excluded.description`,
                  updatedAt: sql`excluded.updated_at`,
                },
              })
              .returning({ id: concept.id, name: concept.name });
      const after = await tx.select({ count: sql<number>`count(*)::int` }).from(concept);
      const conceptId = new Map(concepts.map((c) => [c.name, c.id]));
      const idOf = (name: string) => {
        const id = conceptId.get(name);
        if (id === undefined) throw new Error(`시드에 없는 개념: ${name}`);
        return id;
      };

      const edges: { fromId: number; toId: number; type: ConceptEdgeType }[] = [];
      for (const c of seed.concepts) {
        const from = idOf(c.name);
        if (c.parent !== undefined) edges.push({ fromId: from, toId: idOf(c.parent), type: 'PART_OF' });
        for (const r of c.requires) edges.push({ fromId: from, toId: idOf(r), type: 'PREREQUISITE' });
        for (const r of c.related) {
          const to = idOf(r);
          edges.push({ fromId: Math.min(from, to), toId: Math.max(from, to), type: 'RELATED' });
        }
      }
      const inserted =
        edges.length === 0
          ? []
          : await tx.insert(conceptEdge).values(edges).onConflictDoNothing().returning({ fromId: conceptEdge.fromId });
      const seedIds = [...conceptId.values()];
      const removedEdges = await tx
        .delete(conceptEdge)
        .where(
          and(
            inArray(conceptEdge.fromId, seedIds),
            inArray(conceptEdge.toId, seedIds),
            edges.length === 0
              ? undefined
              : sql`(${conceptEdge.fromId}, ${conceptEdge.toId}, ${conceptEdge.type}) NOT IN (${sql.join(
                  edges.map((e) => sql`(${e.fromId}::bigint, ${e.toId}::bigint, ${e.type})`),
                  sql`, `,
                )})`,
          ),
        )
        .returning({ fromId: conceptEdge.fromId });

      const removed = await tx
        .delete(concept)
        .where(
          and(
            eq(concept.origin, 'SEED'),
            notInArray(
              concept.name,
              seed.concepts.map((c) => c.name),
            ),
          ),
        )
        .returning({ id: concept.id });
      await tx.delete(track).where(notInArray(track.key, [...trackId.keys()]));

      return {
        tracks: tracks.length,
        concepts: concepts.length,
        newConcepts: (after[0]?.count ?? 0) - (before[0]?.count ?? 0),
        newEdges: inserted.length,
        removedConcepts: removed.length,
        removedEdges: removedEdges.length,
      };
    });
  }
}

function trackIdOf(ids: Map<string, number>, key: string): number {
  const id = ids.get(key);
  if (id === undefined) throw new Error(`시드에 없는 트랙: ${key}`);
  return id;
}
