import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { ClockModule } from './core/clock/clock.module.js';
import { AppConfigModule } from './core/config/app-config.module.js';
import { DbModule } from './core/db/db.module.js';
import { ExtractionService } from './core/ingestion/extraction.service.js';
import { IngestionModule } from './core/ingestion/ingestion.module.js';
import { StderrLogger } from './core/logging/stderr-logger.js';

/*
 * 동기화한 문서에서 경험 카드를 뽑고 끝낸다 (`npm run extract`). 문서마다 `claude -p`를 한 번 부르므로 구독 사용량을 쓴다.
 * - 옵션 없음: 아직 뽑지 않았거나 실패한 문서 전체
 * - `--limit 5`: 그중 앞에서 5개 (품질을 먼저 볼 때)
 * - `--ids 3,7`: 상태와 상관없이 그 문서만 다시 (프롬프트를 고친 뒤)
 */
const options = z
  .object({
    limit: z.coerce.number().int().positive().optional(),
    ids: z
      .string()
      .transform((s) => s.split(',').map(Number))
      .pipe(z.array(z.number().int().positive()))
      .optional(),
  })
  .parse(parseArgs({ options: { limit: { type: 'string' }, ids: { type: 'string' } } }).values);

@Module({ imports: [AppConfigModule, ClockModule, DbModule.forRoot({ migrate: false }), IngestionModule] })
class ExtractAppModule {}

const app = await NestFactory.createApplicationContext(ExtractAppModule, { logger: new StderrLogger() });
try {
  const r = await app.get(ExtractionService).run(options);
  process.stderr.write(
    `추출 완료: 문서 ${r.done}개, 카드 ${r.cards}장, 새 개념 자동 승인 ${r.autoApproved}·승인 대기 ${r.proposed}, 실패 ${r.failed.length}\n`,
  );
  for (const f of r.failed) process.stderr.write(`  실패: ${f.title}: ${f.error}\n`);
  if (r.stopped !== null) process.stderr.write(`중간에 멈춤: ${r.stopped}\n`);
  if (r.failed.length > 0 || r.stopped !== null) process.exitCode = 1;
} finally {
  await app.close();
}
