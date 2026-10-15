import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { ClockModule } from './core/clock/clock.module.js';
import { validateEnv } from './core/config/env.js';
import { DbModule } from './core/db/db.module.js';
import { McpModule } from './core/mcp/mcp.module.js';
import { StudyModule } from './tutor/conversation/study.module.js';

// 릴리스 디렉터리에도 package.json이 함께 배포된다 (ops/deploy.sh).
const { version } = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')));

/**
 * MCP 진입점(mcp-stdio.ts)의 루트 모듈. Claude Desktop이 띄우므로 Discord·예약 작업은 넣지 않는다.
 * 작업 디렉터리가 프로젝트 루트가 아닐 수 있어 `.env` 위치를 `GROWTH_ENV_FILE`로 받는다.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: process.env.GROWTH_ENV_FILE ?? '.env',
      // MCP 서버는 Discord에 접속하지 않으므로 Discord 설정을 요구하지 않는다.
      validate: (raw) => validateEnv({ ...raw, DISCORD_ENABLED: 'false' }),
    }),
    ClockModule,
    DbModule.forRoot({ migrate: false }),
    McpModule.forRoot({ name: 'growth-assistant', version }),
    StudyModule,
  ],
})
export class McpAppModule {}
