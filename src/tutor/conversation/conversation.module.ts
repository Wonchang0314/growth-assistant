import { Module } from '@nestjs/common';
import { ConversationRepository } from './conversation.repository.js';

@Module({
  providers: [ConversationRepository],
  exports: [ConversationRepository],
})
export class ConversationModule {}
