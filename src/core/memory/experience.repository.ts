import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { containsAnyTerm } from '../db/sql.js';
import { concept, conceptEdge, track } from '../knowledge/concept.schema.js';
import type { ConceptPlan } from '../knowledge/concept-proposal.js';
import type { ExperienceCard } from './experience.js';
import { experience, experienceConcept } from './experience.schema.js';
import { sourceDocument } from './source-document.schema.js';

/** 문서에서 뽑은 카드. [concepts]는 기존 개념 id나 같이 저장하는 새 개념 이름이다 (`ConceptPlan.resolve`). */
export type ExtractedCard = ExperienceCard & { readonly concepts: readonly (number | string)[] };

/** 대화에 싣는 경험 카드. 원문 문서가 있으면 제목과 링크를 함께 준다. */
export type FoundExperience = Omit<ExperienceCard, 'occurredAt'> & {
  readonly id: number;
  readonly occurredAt: string | null;
  readonly document: { readonly title: string; readonly url: string } | null;
};

const foundColumns = {
  id: experience.id,
  projectName: experience.projectName,
  title: experience.title,
  situation: experience.situation,
  task: experience.task,
  action: experience.action,
  result: experience.result,
  lesson: experience.lesson,
  occurredAt: experience.occurredAt,
  documentTitle: sourceDocument.title,
  documentUrl: sourceDocument.url,
};

@Injectable()
export class ExperienceRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** [conceptIds] 중 하나라도 연결된 카드. 맞은 개념이 많은 것부터, 같으면 최근 경험부터. */
  async findByConcepts(conceptIds: readonly number[], limit: number): Promise<FoundExperience[]> {
    if (conceptIds.length === 0) return [];
    const matched = count(experienceConcept.conceptId);
    const rows = await this.db
      .select(foundColumns)
      .from(experience)
      .innerJoin(
        experienceConcept,
        and(eq(experienceConcept.experienceId, experience.id), inArray(experienceConcept.conceptId, [...conceptIds])),
      )
      .leftJoin(sourceDocument, eq(sourceDocument.id, experience.documentId))
      .groupBy(experience.id, sourceDocument.id)
      .orderBy(desc(matched), sql`${experience.occurredAt} DESC NULLS LAST`, desc(experience.id))
      .limit(limit);
    return rows.map(toFound);
  }

  /** 제목이나 STAR+L 중 하나에 검색어가 하나라도 들어간 카드. 최근 경험부터. 검색어가 없으면 빈 배열. */
  async search(terms: readonly string[], limit: number): Promise<FoundExperience[]> {
    const condition = containsAnyTerm(
      [
        experience.title,
        experience.situation,
        experience.task,
        experience.action,
        experience.result,
        experience.lesson,
      ],
      terms,
    );
    if (condition === undefined) return [];
    const rows = await this.db
      .select(foundColumns)
      .from(experience)
      .leftJoin(sourceDocument, eq(sourceDocument.id, experience.documentId))
      .where(condition)
      .orderBy(sql`${experience.occurredAt} DESC NULLS LAST`, desc(experience.id))
      .limit(limit);
    return rows.map(toFound);
  }

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

/** [foundColumns]로 읽은 행. 원문 문서는 left join이라 없을 수 있다. */
type FoundRow = Omit<FoundExperience, 'document'> & { documentTitle: string | null; documentUrl: string | null };

function toFound({ documentTitle, documentUrl, ...card }: FoundRow): FoundExperience {
  const document = documentTitle === null || documentUrl === null ? null : { title: documentTitle, url: documentUrl };
  return { ...card, document };
}
