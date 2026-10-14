import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { inject } from 'vitest';
import type { Db } from '../../src/core/db/db.module.js';

/**
 * 테스트 파일마다 공용 컨테이너(global-setup.ts)에 연결한다.
 * DB 테스트 파일은 차례로 실행되므로(vitest.config.ts) 테스트 사이에 [truncateAll]로 비우면 된다.
 */
export function connectTestDb() {
  const pool = new Pool(inject('database'));
  const db: Db = drizzle({ client: pool });

  return {
    db,
    /** public 스키마의 모든 테이블을 비우고 ID를 1부터 다시 시작한다. 마이그레이션 기록은 drizzle 스키마에 있어 남는다. */
    async truncateAll() {
      const { rows } = await pool.query<{ tablename: string }>(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
      );
      if (rows.length === 0) return;
      const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
      await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    },
    async count(table: string) {
      const result = await db.execute<{ count: number }>(
        sql`SELECT count(*)::int AS count FROM ${sql.identifier(table)}`,
      );
      return result.rows[0]?.count;
    },
    close: () => pool.end(),
  };
}
