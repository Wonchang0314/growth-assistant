import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClockModule } from './core/clock/clock.module.js';
import { validateEnv } from './core/config/env.js';
import { DbModule } from './core/db/db.module.js';
import { DiscordModule } from './core/discord/discord.module.js';
import { LlmModule } from './core/llm/llm.module.js';
import { SettingModule } from './core/setting/setting.module.js';
import { ConversationModule } from './tutor/conversation/conversation.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ClockModule,
    DbModule,
    SettingModule,
    DiscordModule,
    LlmModule,
    ConversationModule,
  ],
})
export class AppModule {}
