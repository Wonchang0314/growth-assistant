import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

@Injectable()
class Dependency {
  readonly name = 'dependency';
}

@Injectable()
class Consumer {
  constructor(readonly dependency: Dependency) {}
}

describe('Nest 주입', () => {
  // tsconfig의 emitDecoratorMetadata가 빠지면 @Inject 없는 생성자 주입이 undefined가 된다.
  it('생성자 매개변수 타입으로 의존성을 주입한다', async () => {
    const app = await Test.createTestingModule({ providers: [Dependency, Consumer] }).compile();

    expect(app.get(Consumer).dependency.name).toBe('dependency');
    await app.close();
  });
});
