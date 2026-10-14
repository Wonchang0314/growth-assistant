import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { Env } from '../src/core/config/env.js';

@Injectable()
class Dependency {
  readonly name = 'dependency';
}

@Injectable()
class Consumer {
  constructor(readonly dependency: Dependency) {}
}

describe('AppModule', () => {
  it('Discord 없이 뜨고 검증된 설정을 준다', async () => {
    const app = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const config = app.get<ConfigService<Env, true>>(ConfigService);

    expect(config.get('DISCORD_ENABLED', { infer: true })).toBe(false);
    expect(config.get('POSTGRES_PORT', { infer: true })).toBeTypeOf('number');
    await app.close();
  });

  // tsconfig의 emitDecoratorMetadata가 빠지면 @Inject 없는 생성자 주입이 undefined가 된다.
  it('생성자 매개변수 타입으로 의존성을 주입한다', async () => {
    const app = await Test.createTestingModule({ providers: [Dependency, Consumer] }).compile();

    expect(app.get(Consumer).dependency.name).toBe('dependency');
    await app.close();
  });
});
