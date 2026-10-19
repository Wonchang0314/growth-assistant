import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DB_POOL } from '../db/db.module.js';

/**
 * 이름으로 거는 PostgreSQL 세션 advisory 잠금. 프로세스가 달라도(HTTP 서버의 예약 작업, stdio 서버의 `sync_now`)
 * 같은 일이 겹쳐 돌지 않는다. 잡은 동안 풀의 연결 하나를 쓰고, 프로세스가 죽어 연결이 끊기면 저절로 풀린다.
 */
@Injectable()
export class JobLock {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  /** 잠금을 잡으면 푸는 함수를, 이미 누가 잡고 있으면 null을 돌려준다. */
  async tryAcquire(key: string): Promise<(() => Promise<void>) | null> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [
        key,
      ]);
      if (rows[0]?.locked !== true) {
        client.release();
        return null;
      }
    } catch (e) {
      client.release();
      throw e;
    }
    return async () => {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]);
      } finally {
        client.release();
      }
    };
  }

  /**
   * 지금 누가 [key] 잠금을 잡고 있는지. 잠금을 잡아 보지 않고 `pg_locks`를 읽으므로 같은 때 시작하는 작업을 막지 않는다.
   * bigint 키 하나의 advisory 잠금은 `pg_locks`에 위 32비트가 `classid`, 아래 32비트가 `objid`로 보인다.
   */
  async isHeld(key: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ held: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_locks
         WHERE locktype = 'advisory' AND granted AND objsubid = 1
           AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
           AND classid = ((hashtext($1)::bigint >> 32) & 4294967295)::oid
           AND objid = (hashtext($1)::bigint & 4294967295)::oid
       ) AS held`,
      [key],
    );
    return rows[0]?.held === true;
  }
}
