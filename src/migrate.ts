import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { validateEnv } from './core/config/env.js';
import { applyMigrations } from './core/db/db.module.js';

/*
 * 마이그레이션만 적용하고 끝낸다 (`npm run db:migrate`). MCP 서버는 시작할 때 마이그레이션하지 않으므로
 * 스키마를 바꾼 뒤, 그리고 배포할 때(ops/deploy.sh) 실행한다.
 */
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
try {
  await applyMigrations(drizzle({ client: pool }));
  process.stderr.write(`마이그레이션 적용 완료: ${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}\n`);
} finally {
  await pool.end();
}
