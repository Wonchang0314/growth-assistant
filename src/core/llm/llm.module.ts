import { Module } from '@nestjs/common';
import { LlmCallLogRepository } from './llm-call-log.repository.js';

@Module({
  providers: [LlmCallLogRepository],
  exports: [LlmCallLogRepository],
})
export class LlmModule {}
