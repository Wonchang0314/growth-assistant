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
import { QuizQuestionRepository } from './tutor/quiz/application/ports.js';
import { QuizGenerationService } from './tutor/quiz/application/quiz-generation.service.js';
import { QUESTION_TYPES } from './tutor/quiz/domain/quiz-question.js';
import type { QuestionHistory } from './tutor/quiz/domain/variant.js';
import { QuizModule } from './tutor/quiz/quiz.module.js';

/*
 * 문제를 만들어 문제 풀에 저장하고 출력한다 (`npm run quiz`). 출제 품질을 볼 때 쓴다.
 * 문제마다 `claude -p`를 2~4번(출제 Sonnet, 검증 Opus, 변형이면 비교 Opus 한 번 더) 부르므로 구독 사용량을 쓴다.
 * - `--concept "인덱스 원리"`: 개념 이름이나 별칭
 * - `--variant-of 12`: 그 문제의 변형 (개념은 원래 문제의 개념)
 * - `--type FILL_BLANK`: 유형. 없으면 객관식과 빈칸을 번갈아
 * - `--count 3`: 문제 수 (기본 2)
 */
const options = z
  .object({
    concept: z.string().min(1).optional(),
    variantOf: z.coerce.number().int().positive().optional(),
    type: z.enum(QUESTION_TYPES).optional(),
    count: z.coerce.number().int().positive().default(2),
  })
  .refine((o) => o.concept !== undefined || o.variantOf !== undefined, '--concept나 --variant-of가 필요하다')
  .parse(
    (({ 'variant-of': variantOf, ...rest }) => ({ ...rest, variantOf }))(
      parseArgs({
        options: {
          concept: { type: 'string' },
          'variant-of': { type: 'string' },
          type: { type: 'string' },
          count: { type: 'string' },
        },
      }).values,
    ),
  );

@Module({
  imports: [AppConfigModule, ClockModule, DbModule.forRoot({ migrate: false }), KnowledgeModule, QuizModule],
})
class QuizAppModule {}

const app = await NestFactory.createApplicationContext(QuizAppModule, { logger: new StderrLogger() });
try {
  const { conceptId, variantOf } = await target();
  for (let i = 0; i < options.count; i++) {
    const type = options.type ?? QUESTION_TYPES[i % QUESTION_TYPES.length] ?? 'MULTIPLE_CHOICE';
    const r = await app.get(QuizGenerationService).generate({ conceptId, type, variantOf });
    process.stdout.write(`${JSON.stringify(r, null, 2)}\n`);
    if (r.status === 'INVALID') process.exitCode = 1;
  }
} finally {
  await app.close();
}

async function target(): Promise<{ conceptId: number; variantOf: QuestionHistory | undefined }> {
  if (options.variantOf !== undefined) {
    const questions = app.get(QuizQuestionRepository);
    const original = await questions.find(options.variantOf);
    if (!original) throw new Error(`없는 문제 번호다: ${options.variantOf}`);
    const history = await questions.findHistory(original.conceptId);
    const variantOf = history.find((h) => h.question.id === original.id);
    if (!variantOf) throw new Error(`검증을 통과하지 않았거나 신고된 문제다: ${options.variantOf}`);
    return { conceptId: original.conceptId, variantOf };
  }
  const { resolved } = await app.get(ConceptService).resolve([options.concept ?? '']);
  const concept = resolved[0];
  if (!concept) throw new Error(`개념 목록에 없다: ${options.concept ?? ''}`);
  return { conceptId: concept.id, variantOf: undefined };
}
