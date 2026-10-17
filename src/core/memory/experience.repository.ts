import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { concept, conceptEdge, track } from '../knowledge/concept.schema.js';
import type { ConceptPlan } from '../knowledge/concept-proposal.js';
import type { ExperienceCard } from './experience.js';
import { experience, experienceConcept } from './experience.schema.js';
import { sourceDocument } from './source-document.schema.js';

/** 문서에서 뽑은 카드. [concepts]는 기존 개념 id나 같이 저장하는 새 개념 이름이다 (`ConceptPlan.resolve`). */
export type ExtractedCard = ExperienceCard & { readonly concepts: readonly (number | string)[] };

@Injectable()
export class ExperienceRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 문서 하나의 추출 결과를 한 트랜잭션으로 반영한다 (설계 문서 7.1의 6).
   * 새 개념과 별칭을 먼저 저장하고, 그 문서에서 뽑았던 카드는 지우고 새 카드로 바꾼 뒤 문서를 DONE으로 둔다.
   */
  async saveExtraction(input: {
    documentId: number;
    summary: string;
    cards: readonly ExtractedCard[];
    newConcepts: ConceptPlan['newConcepts'];
    aliasAdds: ConceptPlan['aliasAdds'];
    now: Date;
  }): Promise<void> {
    const { documentId, now } = input;
    await this.db.transaction(async (tx) => {
      const tracks = new Map((await tx.select({ id: track.id, key: track.key }).from(track)).map((t) => [t.key, t.id]));
      const newIds = new Map<string, number>();
      for (const c of input.newConcepts) {
        const trackId = tracks.get(c.track);
        if (trackId === undefined) throw new Error(`없는 트랙: ${c.track}`);
        const [row] = await tx
          .insert(concept)
          .values({
            trackId,
            name: c.name,
            aliases: [...c.aliases],
            description: c.description,
            status: c.status,
            origin: 'INGESTION',
            autoApproved: c.autoApproved,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: concept.id });
        if (!row) throw new Error(`개념을 저장하지 못했다: ${c.name}`);
        newIds.set(c.name, row.id);
        if (c.parentId !== null)
          await tx.insert(conceptEdge).values({ fromId: row.id, toId: c.parentId, type: 'PART_OF' });
      }
      for (const a of input.aliasAdds) {
        await tx
          .update(concept)
          .set({ aliases: sql`array_append(${concept.aliases}, ${a.alias})`, updatedAt: now })
          .where(eq(concept.id, a.conceptId));
      }

      await tx.delete(experience).where(eq(experience.documentId, documentId));
      for (const { concepts, ...card } of input.cards) {
        const [row] = await tx
          .insert(experience)
          .values({ ...card, documentId, origin: 'DOCUMENT', createdAt: now, updatedAt: now })
          .returning({ id: experience.id });
        if (!row) throw new Error(`경험 카드를 저장하지 못했다: ${card.title}`);
        const conceptIds = new Set(
          concepts.flatMap((ref) => (typeof ref === 'number' ? ref : (newIds.get(ref) ?? []))),
        );
        if (conceptIds.size > 0) {
          await tx
            .insert(experienceConcept)
            .values([...conceptIds].map((conceptId) => ({ experienceId: row.id, conceptId })));
        }
      }

      await tx
        .update(sourceDocument)
        .set({ summary: input.summary, extractionStatus: 'DONE', lastError: null })
        .where(eq(sourceDocument.id, documentId));
    });
  }
}
