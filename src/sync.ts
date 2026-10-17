import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClockModule } from './core/clock/clock.module.js';
import { AppConfigModule } from './core/config/app-config.module.js';
import { DbModule } from './core/db/db.module.js';
import { IngestionModule } from './core/ingestion/ingestion.module.js';
import { SyncService } from './core/ingestion/sync.service.js';
import { StderrLogger } from './core/logging/stderr-logger.js';

/*
 * Notion 문서를 한 번 동기화하고 끝낸다 (`npm run sync`). 처음 실행이 백필이고, 그 뒤로는 바뀐 문서만 다시 읽는다.
 * MCP 서버는 Claude Desktop이 띄우고 끄므로 몇 분 걸리는 수집을 맡기지 않는다. 매일 실행은 4단계 예약 작업에서 붙인다.
 */
@Module({ imports: [AppConfigModule, ClockModule, DbModule.forRoot({ migrate: false }), IngestionModule] })
class SyncAppModule {}

const app = await NestFactory.createApplicationContext(SyncAppModule, { logger: new StderrLogger() });
try {
  const r = await app.get(SyncService).run();
  process.stderr.write(
    `동기화 완료: 문서 ${r.listed}개 (새로 ${r.created}, 바뀜 ${r.changed}, 본문 같음 ${r.unchanged}, 건너뜀 ${r.skipped}, 지움 ${r.deleted}), ` +
      `청크 더함 ${r.addedChunks}, 지움 ${r.removedChunks}, 실패 ${r.failed.length}\n`,
  );
  for (const f of r.failed) process.stderr.write(`  실패: ${f.title}: ${f.error}\n`);
  if (r.failed.length > 0) process.exitCode = 1;
} finally {
  await app.close();
}
