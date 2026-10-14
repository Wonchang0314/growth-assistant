import { Inject, Injectable } from '@nestjs/common';
import { desc, ilike, notInArray, or, type SQL, sql } from 'drizzle-orm';
import { DB, type Db } from '../../core/db/db.module.js';
import { studyNote } from './study-note.schema.js';
import type { NewStudyNote, StudyNote } from './study-note.js';

@Injectable()
export class StudyNoteRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async add(note: NewStudyNote): Promise<StudyNote> {
    const [row] = await this.db
      .insert(studyNote)
      .values({ ...note, confusedPoints: [...note.confusedPoints] })
      .returning();
    if (!row) throw new Error('학습 기록을 저장하지 못했다');
    return row;
  }

  /** 주제·요약·헷갈린 점 중 하나에 검색어가 하나라도 들어간 기록을 최근 것부터. 검색어가 없으면 빈 배열. */
  async search(terms: readonly string[], limit: number): Promise<StudyNote[]> {
    if (terms.length === 0) return [];
    const conditions = terms.flatMap((term): SQL[] => {
      const pattern = `%${escapeLike(term)}%`;
      return [
        ilike(studyNote.topic, pattern),
        ilike(studyNote.summary, pattern),
        sql`array_to_string(${studyNote.confusedPoints}, ' ') ILIKE ${pattern}`,
      ];
    });
    return this.db
      .select()
      .from(studyNote)
      .where(or(...conditions))
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

/** LIKE 패턴의 특수 문자(`%`, `_`, `\`)를 글자 그대로 찾게 한다. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
