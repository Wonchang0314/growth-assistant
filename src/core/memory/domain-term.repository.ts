import { Inject, Injectable } from '@nestjs/common';
import { asc, notInArray } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { domainTerm } from './domain-term.schema.js';
import type { DomainTermInput } from './domain-term.js';

@Injectable()
export class DomainTermRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findAll(): Promise<DomainTermInput[]> {
    return this.db
      .select({ term: domainTerm.term, replacement: domainTerm.replacement, isPattern: domainTerm.isPattern })
      .from(domainTerm)
      .orderBy(asc(domainTerm.term));
  }

  /**
   * 용어 목록을 [terms]로 맞춘다. 없던 용어는 넣고, 있던 용어는 고치고, 빠진 용어는 지운다. 여러 번 돌려도 같다.
   * 처음 넣은 시각은 바꾸지 않는다.
   */
  async replaceAll(terms: readonly DomainTermInput[], now: Date): Promise<{ added: number; removed: number }> {
    return this.db.transaction(async (tx) => {
      const names = terms.map((t) => t.term);
      const existed = new Set((await tx.select({ term: domainTerm.term }).from(domainTerm)).map((r) => r.term));
      const removed = await tx
        .delete(domainTerm)
        .where(names.length > 0 ? notInArray(domainTerm.term, names) : undefined)
        .returning({ term: domainTerm.term });
      for (const t of terms) {
        await tx
          .insert(domainTerm)
          .values({ ...t, createdAt: now })
          .onConflictDoUpdate({ target: domainTerm.term, set: { replacement: t.replacement, isPattern: t.isPattern } });
      }
      return { added: names.filter((n) => !existed.has(n)).length, removed: removed.length };
    });
  }
}
