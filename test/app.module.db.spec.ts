import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, inject, it, vi } from 'vitest';
import type { Env } from '../src/core/config/env.js';
import { DiscordGateway } from '../src/core/discord/discord-gateway.js';
import { ConversationRepository } from '../src/tutor/conversation/conversation.repository.js';

describe('AppModule', () => {
  it('Discord 없이 테스트 DB에 붙어 뜬다', async () => {
    const database = inject('database');
    vi.stubEnv('POSTGRES_HOST', database.host);
    vi.stubEnv('POSTGRES_PORT', String(database.port));
    vi.stubEnv('POSTGRES_DB', database.database);
    vi.stubEnv('POSTGRES_USER', database.user);
    vi.stubEnv('POSTGRES_PASSWORD', database.password);
    // ConfigModule.forRoot()는 모듈을 불러올 때 환경 변수를 읽으므로 값을 바꾼 뒤 불러온다.
    const { AppModule } = await import('../src/app.module.js');

    const app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await app.init();

    expect(app.get<ConfigService<Env, true>>(ConfigService).get('DISCORD_ENABLED', { infer: true })).toBe(false);
    // 마이그레이션이 적용된 DB에 쿼리가 나가는지만 본다 (다른 DB 테스트가 남긴 행이 있을 수 있다).
    expect(await app.get(ConversationRepository).findSessionByThreadId('999999999999999999')).toBeUndefined();
    // 기능 모듈의 Discord 처리기를 게이트웨이가 찾는다.
    const gateway = app.get(DiscordGateway);
    expect(gateway.commandNames).toEqual(['end']);
    expect(gateway.messageHandlerCount).toBe(1);
    await app.close();
  });
});
