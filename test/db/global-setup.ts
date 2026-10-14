import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { TestProject } from 'vitest/node';
import { MIGRATIONS_FOLDER } from '../../src/core/db/db.module.js';

export interface TestDatabase {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    database: TestDatabase;
  }
}

/** DB 테스트 전체에서 PostgreSQL 컨테이너 하나를 띄우고 마이그레이션을 한 번 적용한다. */
export default async function setup(project: TestProject) {
  // 테스트 DB는 버려도 되므로 데이터를 메모리(tmpfs)에 두고 디스크 동기화를 끈다. 시작·쓰기가 몇 배 빨라진다.
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'synchronous_commit=off', '-c', 'full_page_writes=off'])
    .start();
  const database: TestDatabase = {
    host: container.getHost(),
    port: container.getPort(),
    database: container.getDatabase(),
    user: container.getUsername(),
    password: container.getPassword(),
  };

  const pool = new Pool(database);
  await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS_FOLDER });
  await pool.end();

  project.provide('database', database);
  return async () => {
    await container.stop();
  };
}
