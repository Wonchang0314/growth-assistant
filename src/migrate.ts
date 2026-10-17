import { applyMigrations } from './core/db/db.module.js';
import { openScriptDb } from './core/db/script-db.js';

/*
 * 마이그레이션만 적용하고 끝낸다 (`npm run db:migrate`). MCP 서버는 시작할 때 마이그레이션하지 않으므로
 * 스키마를 바꾼 뒤, 그리고 배포할 때(ops/deploy.sh) 실행한다.
 */
const { env, db, close } = openScriptDb();
try {
  await applyMigrations(db);
  process.stderr.write(`마이그레이션 적용 완료: ${env.POSTGRES_HOST}:${env.POSTGRES_PORT}/${env.POSTGRES_DB}\n`);
} finally {
  await close();
}
