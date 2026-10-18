import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { ClockModule } from './core/clock/clock.module.js';
import { AppConfigModule } from './core/config/app-config.module.js';
import { DbModule } from './core/db/db.module.js';
import { CaseAbstractionService } from './core/ingestion/case-abstraction.service.js';
import { IngestionModule } from './core/ingestion/ingestion.module.js';
import { StderrLogger } from './core/logging/stderr-logger.js';

/*
 * 경험 카드에서 판단 사례를 만들고 끝낸다 (`npm run abstract`). 선별·치환은 Sonnet, 검증은 Opus라 구독 사용량을 쓴다.
 * - 옵션 없음: 아직 선별하지 않은 카드를 모두 선별하고, 판단이 분명한 카드 전부를 추상화
 * - `--limit 10`: 판단이 분명한 카드가 10장 모일 때까지만 선별하고 그 10장을 추상화 (품질을 먼저 볼 때)
 * - `--ids 3,7`: 선별 없이 그 카드만 다시 (프롬프트를 고친 뒤)
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
class AbstractAppModule {}

const app = await NestFactory.createApplicationContext(AbstractAppModule, { logger: new StderrLogger() });
try {
  const r = await app.get(CaseAbstractionService).run(options);
  process.stderr.write(
    `추상화 완료: 선별 ${r.screened}장(판단 있음 ${r.decisions}), 판단 사례 경험 ${r.experience}·가정 ${r.hypothetical}·PENDING ${r.pending}, 실패 ${r.failed.length}\n`,
  );
  for (const f of r.failed) process.stderr.write(`  실패: ${f.title}: ${f.error}\n`);
  if (r.stopped !== null) process.stderr.write(`중간에 멈춤: ${r.stopped}\n`);
  if (r.failed.length > 0 || r.stopped !== null) process.exitCode = 1;
} finally {
  await app.close();
}
