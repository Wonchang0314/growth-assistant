import { join } from 'node:path';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { Env } from '../config/env.js';

export type Db = NodePgDatabase;

/** 저장소가 `@Inject(DB)`로 받는 Drizzle 인스턴스. */
export const DB = Symbol('DB');
const DB_POOL = Symbol('DB_POOL');

/** drizzle-kit이 만든 SQL 마이그레이션 (`npm run db:generate`). 빌드할 때 dist로 함께 복사한다 (nest-cli.json). */
export const MIGRATIONS_FOLDER = join(import.meta.dirname, 'migrations');

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Pool({
          host: config.get('POSTGRES_HOST', { infer: true }),
          port: config.get('POSTGRES_PORT', { infer: true }),
          database: config.get('POSTGRES_DB', { infer: true }),
          user: config.get('POSTGRES_USER', { infer: true }),
          password: config.get('POSTGRES_PASSWORD', { infer: true }),
        }),
    },
    {
      provide: DB,
      inject: [DB_POOL],
      // 시작할 때 아직 적용하지 않은 마이그레이션을 적용한다. 실패하면 앱이 뜨지 않는다.
      useFactory: async (pool: Pool): Promise<Db> => {
        const db = drizzle({ client: pool });
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        return db;
      },
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
