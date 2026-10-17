import { openScriptDb } from './core/db/script-db.js';
import { ConceptRepository } from './core/knowledge/concept.repository.js';
import { loadSeed } from './core/knowledge/concept-seed.js';

/*
 * 시드 개념(src/core/knowledge/seed/*.yaml)을 검증하고 DB에 반영한 뒤 끝낸다 (`npm run db:seed`).
 * 여러 번 돌려도 결과가 같고, 시드에서 빠진 시드 개념·트랙은 지운다. 마이그레이션 뒤에, 그리고 배포할 때(ops/deploy.sh) 실행한다.
 */
const seed = loadSeed();
const { db, close } = openScriptDb();
try {
  const result = await new ConceptRepository(db).applySeed(seed, new Date());
  process.stderr.write(
    `시드 적재 완료: 트랙 ${result.tracks}, 개념 ${result.concepts}(새로 ${result.newConcepts}, 지움 ${result.removedConcepts}), 관계 새로 ${result.newEdges}, 지움 ${result.removedEdges}\n`,
  );
} finally {
  await close();
}
