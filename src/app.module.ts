import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './core/config/env.js';
import { DbModule } from './core/db/db.module.js';
import { LlmModule } from './core/llm/llm.module.js';
import { SettingModule } from './core/setting/setting.module.js';
import { ConversationModule } from './tutor/conversation/conversation.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    DbModule,
    SettingModule,
    LlmModule,
    ConversationModule,
  ],
})
export class AppModule {}
