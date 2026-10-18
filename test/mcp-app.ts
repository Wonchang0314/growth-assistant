import { Test, type TestingModule } from '@nestjs/testing';
import { inject, vi } from 'vitest';
import { Clock } from '../src/core/clock/clock.js';

/**
 * 공용 테스트 DB 컨테이너에 붙는 MCP 진입점의 루트 모듈(McpAppModule)을 띄운다. 시각은 [clock]으로 고정한다.
 * 환경 변수를 바꾸므로 파일 끝에 `vi.unstubAllEnvs()`를 부른다.
 */
export async function startMcpApp(clock: Clock): Promise<TestingModule> {
  const database = inject('database');
  vi.stubEnv('POSTGRES_HOST', database.host);
  vi.stubEnv('POSTGRES_PORT', String(database.port));
  vi.stubEnv('POSTGRES_DB', database.database);
  vi.stubEnv('POSTGRES_USER', database.user);
  vi.stubEnv('POSTGRES_PASSWORD', database.password);
  // ConfigModule.forRoot()는 모듈을 불러올 때 환경 변수를 읽으므로 값을 바꾼 뒤 불러온다.
  const { McpAppModule } = await import('../src/mcp-app.module.js');

  const app = await Test.createTestingModule({ imports: [McpAppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  await app.init();
  return app;
}
