import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { type Env, validateEnv } from '../config/env.js';
import type { Db } from './db.module.js';

/**
 * Nest 없이 한 번 돌고 끝나는 스크립트(`migrate.ts`, `seed.ts`, `terms.ts`)의 DB 연결.
 * `.env`(`GROWTH_ENV_FILE`)를 읽고 검증한 뒤 연결한다. 끝나면 [close]를 부른다.
 */
export function openScriptDb(): { env: Env; db: Db; close: () => Promise<void> } {
  try {
    process.loadEnvFile(process.env.GROWTH_ENV_FILE ?? '.env');
  } catch {
    // .env가 없으면 실행 환경 변수와 기본값을 쓴다.
  }
  const env = validateEnv(process.env);
  const pool = new Pool({
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
  });
  return { env, db: drizzle({ client: pool }), close: () => pool.end() };
}
