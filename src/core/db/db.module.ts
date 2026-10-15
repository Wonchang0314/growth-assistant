import { join } from 'node:path';
import { type DynamicModule, Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
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

/** 아직 적용하지 않은 마이그레이션을 적용한다. 이미 적용한 것은 건너뛴다. */
export async function applyMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

@Global()
@Module({})
export class DbModule implements OnApplicationShutdown {
  /**
   * `migrate: true`면 시작할 때 마이그레이션을 적용하고, 실패하면 앱이 뜨지 않는다 (상시 실행 앱).
   * MCP 서버는 Claude Desktop이 띄울 때마다 마이그레이션하지 않는다. 배포 때 `npm run db:migrate`로 적용한다.
   */
  static forRoot(options: { migrate: boolean }): DynamicModule {
    return {
      module: DbModule,
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
          useFactory: async (pool: Pool): Promise<Db> => {
            const db = drizzle({ client: pool });
            if (options.migrate) await applyMigrations(db);
            return db;
          },
        },
      ],
      exports: [DB],
    };
  }

  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
