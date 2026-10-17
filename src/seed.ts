import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { validateEnv } from './core/config/env.js';
import { ConceptRepository } from './core/knowledge/concept.repository.js';
import { loadSeed } from './core/knowledge/concept-seed.js';

/*
 * 시드 개념(src/core/knowledge/seed/*.yaml)을 검증하고 DB에 반영한 뒤 끝낸다 (`npm run db:seed`).
 * 여러 번 돌려도 결과가 같고, 시드에서 빠진 시드 개념·트랙은 지운다. 마이그레이션 뒤에, 그리고 배포할 때(ops/deploy.sh) 실행한다.
 */
try {
  process.loadEnvFile(process.env.GROWTH_ENV_FILE ?? '.env');
} catch {
  // .env가 없으면 실행 환경 변수와 기본값을 쓴다.
}
const env = validateEnv(process.env);
const seed = loadSeed();
const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  database: env.POSTGRES_DB,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
});
try {
  const result = await new ConceptRepository(drizzle({ client: pool })).applySeed(seed, new Date());
  process.stderr.write(
    `시드 적재 완료: 트랙 ${result.tracks}, 개념 ${result.concepts}(새로 ${result.newConcepts}, 지움 ${result.removedConcepts}), 새 관계 ${result.newEdges}\n`,
  );
} finally {
  await pool.end();
}
