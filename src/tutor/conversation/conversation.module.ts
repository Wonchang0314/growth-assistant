import { Module } from '@nestjs/common';
import { DiscordModule } from '../../core/discord/discord.module.js';
import { LlmModule } from '../../core/llm/llm.module.js';
import { ConversationRepository } from './conversation.repository.js';
import { ConversationService } from './conversation.service.js';
import { EndCommandHandler } from './discord/end-command.handler.js';
import { IdleSessionJob } from './discord/idle-session.job.js';
import { TutorMessageHandler } from './discord/tutor-message.handler.js';

@Module({
  imports: [DiscordModule, LlmModule],
  providers: [ConversationRepository, ConversationService, TutorMessageHandler, EndCommandHandler, IdleSessionJob],
  exports: [ConversationRepository, ConversationService],
})
export class ConversationModule {}
