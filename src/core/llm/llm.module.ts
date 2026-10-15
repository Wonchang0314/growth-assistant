import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { AdminNotifier, LoggingAdminNotifier } from '../logging/admin-notifier.js';
import { ClaudeClient } from './claude.client.js';
import { ClaudeCliClient } from './claude-cli.client.js';
import { ClaudeProcessRunner, OsClaudeProcessRunner } from './claude-process.runner.js';
import { ClaudeSettings } from './claude.settings.js';
import { LlmCallLogRepository } from './llm-call-log.repository.js';

@Module({
  providers: [
    LlmCallLogRepository,
    { provide: AdminNotifier, useClass: LoggingAdminNotifier },
    {
      provide: ClaudeSettings,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        ClaudeSettings.defaults(config.get('CLAUDE_EXECUTABLE', { infer: true })),
    },
    { provide: ClaudeProcessRunner, useClass: OsClaudeProcessRunner },
    { provide: ClaudeClient, useClass: ClaudeCliClient },
  ],
  exports: [ClaudeClient, LlmCallLogRepository],
})
export class LlmModule {}
