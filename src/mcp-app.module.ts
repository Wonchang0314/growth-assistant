import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { z } from 'zod';
import { ClockModule } from './core/clock/clock.module.js';
import { AppConfigModule } from './core/config/app-config.module.js';
import { DbModule } from './core/db/db.module.js';
import { IngestionModule } from './core/ingestion/ingestion.module.js';
import { McpModule } from './core/mcp/mcp.module.js';
import { QuizModule } from './tutor/quiz/quiz.module.js';
import { STUDY_INSTRUCTIONS } from './tutor/study/study-instructions.js';
import { StudyModule } from './tutor/study/study.module.js';

// 릴리스 디렉터리에도 package.json이 함께 배포된다 (ops/deploy.sh).
const { version } = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));

/** MCP 진입점(mcp-stdio.ts)의 루트 모듈. */
@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    DbModule.forRoot({ migrate: false }),
    McpModule.forRoot({ name: 'growth-assistant', version, instructions: STUDY_INSTRUCTIONS }),
    StudyModule,
    QuizModule,
    IngestionModule,
  ],
})
export class McpAppModule {}
