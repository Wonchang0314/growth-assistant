import type { Type } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { inject, vi } from 'vitest';
import { Clock } from '../src/core/clock/clock.js';

/**
 * 공용 테스트 DB 컨테이너에 붙는 MCP 진입점의 루트 모듈(McpAppModule)을 띄운다. 시각은 [clock]으로 고정한다.
 * 환경 변수를 바꾸므로 파일 끝에 `vi.unstubAllEnvs()`를 부른다.
 */
export async function startMcpApp(clock: Clock): Promise<TestingModule> {
  const app = await compileMcpRoot(clock, async () => (await import('../src/mcp-app.module.js')).McpAppModule);
  await app.init();
  return app;
}

/** [startMcpApp]과 같지만 HTTP 진입점의 루트 모듈(McpHttpAppModule)이다. 띄우기(`listen`)는 테스트가 한다. */
export async function createMcpHttpApp(clock: Clock) {
  const module = await compileMcpRoot(
    clock,
    async () => (await import('../src/mcp-http-app.module.js')).McpHttpAppModule,
  );
  return module.createNestApplication();
}

async function compileMcpRoot(clock: Clock, loadRoot: () => Promise<Type>): Promise<TestingModule> {
  const database = inject('database');
  vi.stubEnv('POSTGRES_HOST', database.host);
  vi.stubEnv('POSTGRES_PORT', String(database.port));
  vi.stubEnv('POSTGRES_DB', database.database);
  vi.stubEnv('POSTGRES_USER', database.user);
  vi.stubEnv('POSTGRES_PASSWORD', database.password);
  // ConfigModule.forRoot()는 모듈을 불러올 때 환경 변수를 읽으므로 값을 바꾼 뒤 불러온다.
  const root = await loadRoot();

  return Test.createTestingModule({ imports: [root] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
}
