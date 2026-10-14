import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB, type Db } from '../db/db.module.js';
import { type LlmCallLog, llmCallLog, type NewLlmCallLog } from './llm-call-log.schema.js';

@Injectable()
export class LlmCallLogRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async insert(entry: NewLlmCallLog): Promise<LlmCallLog> {
    const [row] = await this.db.insert(llmCallLog).values(entry).returning();
    if (!row) throw new Error('llm_call_log 저장 결과가 없다');
    return row;
  }

  async findById(id: number): Promise<LlmCallLog | undefined> {
    const [row] = await this.db.select().from(llmCallLog).where(eq(llmCallLog.id, id));
    return row;
  }
}
