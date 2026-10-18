import 'reflect-metadata';
import { parseArgs } from 'node:util';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { ClockModule } from './core/clock/clock.module.js';
import { AppConfigModule } from './core/config/app-config.module.js';
import { DbModule } from './core/db/db.module.js';
import { ConceptService } from './core/knowledge/concept.service.js';
import { KnowledgeModule } from './core/knowledge/knowledge.module.js';
import { StderrLogger } from './core/logging/stderr-logger.js';
import { QuizGenerationService } from './tutor/quiz/application/quiz-generation.service.js';
import { QUESTION_TYPES } from './tutor/quiz/domain/quiz-question.js';
import { QuizModule } from './tutor/quiz/quiz.module.js';

/*
 * 개념 하나로 문제를 만들어 문제 풀에 저장하고 출력한다 (`npm run quiz`). 출제 품질을 볼 때 쓴다.
 * 문제마다 `claude -p`를 2~4번(출제 Sonnet, 검증 Opus) 부르므로 구독 사용량을 쓴다.
 * - `--concept "인덱스 원리"`: 개념 이름이나 별칭 (필수)
 * - `--type FILL_BLANK`: 유형. 없으면 객관식과 빈칸을 번갈아
 * - `--count 3`: 문제 수 (기본 2)
 */
const options = z
  .object({
    concept: z.string().min(1),
    type: z.enum(QUESTION_TYPES).optional(),
    count: z.coerce.number().int().positive().default(2),
  })
  .parse(
    parseArgs({ options: { concept: { type: 'string' }, type: { type: 'string' }, count: { type: 'string' } } }).values,
  );

@Module({
  imports: [AppConfigModule, ClockModule, DbModule.forRoot({ migrate: false }), KnowledgeModule, QuizModule],
})
class QuizAppModule {}

const app = await NestFactory.createApplicationContext(QuizAppModule, { logger: new StderrLogger() });
try {
  const { resolved } = await app.get(ConceptService).resolve([options.concept]);
  const concept = resolved[0];
  if (!concept) throw new Error(`개념 목록에 없다: ${options.concept}`);
  for (let i = 0; i < options.count; i++) {
    const type = options.type ?? QUESTION_TYPES[i % QUESTION_TYPES.length] ?? 'MULTIPLE_CHOICE';
    const r = await app.get(QuizGenerationService).generate({ conceptId: concept.id, type });
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    if (r.status === 'INVALID') process.exitCode = 1;
  }
} finally {
  await app.close();
}
