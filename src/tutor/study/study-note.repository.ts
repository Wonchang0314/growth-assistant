import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { DB, type Db, type Tx } from '../../core/db/db.module.js';
import type { ConceptMergeParticipant } from '../../core/knowledge/concept-merge.js';
import { containsAnyTerm } from '../../core/db/sql.js';
import { studyNote, studyNoteConcept } from './study-note.schema.js';
import type { NewStudyNote, StudyNote, StudyNoteConceptLink } from './study-note.js';

@Injectable()
export class StudyNoteRepository implements ConceptMergeParticipant {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** 개념 병합: 기록 연결을 [targetId]로 옮긴다. 한 기록에 둘 다 있으면 한 번이라도 CONFUSED면 CONFUSED다. */
  async moveConcept(tx: Tx, sourceId: number, targetId: number): Promise<void> {
    const links = await tx.delete(studyNoteConcept).where(eq(studyNoteConcept.conceptId, sourceId)).returning();
    if (links.length === 0) return;
    await tx
      .insert(studyNoteConcept)
      .values(links.map((l) => ({ ...l, conceptId: targetId })))
      .onConflictDoUpdate({
        target: [studyNoteConcept.noteId, studyNoteConcept.conceptId],
        set: {
          signal: sql`CASE WHEN excluded.signal = 'CONFUSED' THEN 'CONFUSED' ELSE ${studyNoteConcept.signal} END`,
        },
      });
  }

  /** 기록과 개념 연결을 한 트랜잭션으로 저장한다. [links]의 개념은 서로 달라야 한다. */
  async add(note: NewStudyNote, links: readonly StudyNoteConceptLink[] = []): Promise<StudyNote> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(studyNote)
        .values({ ...note, confusedPoints: [...note.confusedPoints] })
        .returning();
      if (!row) throw new Error('학습 기록을 저장하지 못했다');
      if (links.length > 0) {
        await tx.insert(studyNoteConcept).values(links.map((l) => ({ noteId: row.id, ...l })));
      }
      return row;
    });
  }

  /** [conceptIds] 중 하나라도 연결된 기록을 최근 것부터. */
  async findByConcepts(conceptIds: readonly number[], limit: number): Promise<StudyNote[]> {
    if (conceptIds.length === 0) return [];
    const linked = this.db
      .selectDistinct({ noteId: studyNoteConcept.noteId })
      .from(studyNoteConcept)
      .where(inArray(studyNoteConcept.conceptId, [...conceptIds]));
    return this.db
      .select()
      .from(studyNote)
      .where(inArray(studyNote.id, linked))
      .orderBy(desc(studyNote.createdAt), desc(studyNote.id))
      .limit(limit);
  }

  /** 주제·요약·헷갈린 점 중 하나에 검색어가 하나라도 들어간 기록을 최근 것부터. 검색어가 없으면 빈 배열. */
  async search(terms: readonly string[], limit: number): Promise<StudyNote[]> {
    const condition = containsAnyTerm(
      [studyNote.topic, studyNote.summary, sql`array_to_string(${studyNote.confusedPoints}, ' ')`],
      terms,
    );
    if (condition === undefined) return [];
    return this.db
      .select()
      .from(studyNote)
      .where(condition)
      .orderBy(desc(studyNote.createdAt), desc(studyNote.id))
      .limit(limit);
  }

  /** 최근 기록. [excludeIds]는 이미 보여 준 기록이다. */
  async findRecent(limit: number, excludeIds: readonly number[] = []): Promise<StudyNote[]> {
    return this.db
      .select()
      .from(studyNote)
      .where(excludeIds.length > 0 ? notInArray(studyNote.id, [...excludeIds]) : undefined)
      .orderBy(desc(studyNote.createdAt), desc(studyNote.id))
      .limit(limit);
  }
}
